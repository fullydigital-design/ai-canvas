bl_info = {
    "name": "AI Canvas Bridge",
    "author": "AI Canvas",
    "version": (0, 4, 0),
    "blender": (3, 6, 0),
    "location": "View3D > Sidebar > AI Canvas",
    "description": "Send viewport/final render and optional passes to AI Canvas",
    "category": "Import-Export",
}

import json
import os
import tempfile
import time
import glob
import urllib.error
import urllib.request

import bpy

PASS_FIELD_CONFIG = (
    ("depth_path", "depth", "Depth"),
    ("normal_path", "normal", "Normal"),
    ("albedo_path", "albedo", "Albedo"),
    ("object_id_path", "object_id", "Object ID"),
    ("material_id_path", "material_id", "Material ID"),
)


def _bridge_post(base_url: str, path: str, payload: dict, timeout: float = 10.0):
    base = (base_url or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("Bridge URL is empty.")

    url = f"{base}{path}"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            response_data = response.read().decode("utf-8", errors="replace")
            return json.loads(response_data) if response_data else {"ok": True}
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Bridge HTTP {exc.code}: {error_body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Bridge connection failed: {exc}") from exc


def _bridge_get(base_url: str, path: str, timeout: float = 10.0):
    base = (base_url or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("Bridge URL is empty.")
    url = f"{base}{path}"
    req = urllib.request.Request(url=url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            response_data = response.read().decode("utf-8", errors="replace")
            return json.loads(response_data) if response_data else {"ok": True}
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Bridge HTTP {exc.code}: {error_body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Bridge connection failed: {exc}") from exc


def _resolve_seed_value(context: bpy.types.Context):
    settings = context.scene.ai_canvas_bridge_settings
    override = (settings.seed_override or "").strip()
    if override:
        try:
            return int(override)
        except ValueError:
            return override
    scene = context.scene
    cycles = getattr(scene, "cycles", None)
    if cycles is not None and hasattr(cycles, "seed"):
        try:
            return int(cycles.seed)
        except Exception:
            return None
    return None


def _scene_metadata(context: bpy.types.Context):
    scene = context.scene
    percentage = int(scene.render.resolution_percentage)
    width = int(scene.render.resolution_x * percentage / 100)
    height = int(scene.render.resolution_y * percentage / 100)
    return {
        "scene": scene.name,
        "camera": scene.camera.name if scene.camera else None,
        "frame": int(scene.frame_current),
        "width": width,
        "height": height,
        "resolution": {
            "width": width,
            "height": height,
            "percentage": percentage,
        },
        "engine": scene.render.engine,
        "seed": _resolve_seed_value(context),
    }


def _temp_png_path(prefix: str):
    stamp = int(time.time() * 1000)
    return os.path.join(tempfile.gettempdir(), f"{prefix}_{stamp}.png")


def _save_viewport_snapshot(context: bpy.types.Context, output_path: str):
    scene = context.scene
    old_filepath = scene.render.filepath
    old_format = scene.render.image_settings.file_format
    try:
        scene.render.filepath = output_path
        scene.render.image_settings.file_format = "PNG"
        result = bpy.ops.render.opengl(write_still=True, view_context=True)
        if "FINISHED" not in result:
            raise RuntimeError(f"Viewport snapshot failed: {result}")
    finally:
        scene.render.filepath = old_filepath
        scene.render.image_settings.file_format = old_format


def _save_final_render(context: bpy.types.Context, output_path: str):
    scene = context.scene
    render_result = bpy.data.images.get("Render Result")
    if render_result and render_result.has_data:
        render_result.save_render(filepath=output_path, scene=scene)
        return

    result = bpy.ops.render.render(write_still=False, use_viewport=False)
    if "FINISHED" not in result:
        raise RuntimeError(f"Final render failed: {result}")

    render_result = bpy.data.images.get("Render Result")
    if not render_result or not render_result.has_data:
        raise RuntimeError("Render completed but Render Result has no pixel data.")
    render_result.save_render(filepath=output_path, scene=scene)


def _send_image_to_bridge(context: bpy.types.Context, image_path: str, kind: str, layer_name: str):
    settings = context.scene.ai_canvas_bridge_settings
    payload = {
        "source": "blender",
        "kind": kind,
        "imagePath": image_path,
        "layerName": layer_name,
        "metadata": _scene_metadata(context),
    }
    return _bridge_post(settings.bridge_url, "/v1/render/import", payload)


def _collect_optional_pass_entries(settings: bpy.types.PropertyGroup):
    entries = []
    for prop_name, pass_type, display_name in PASS_FIELD_CONFIG:
        path_value = (getattr(settings, prop_name, "") or "").strip()
        if not path_value:
            continue
        file_path = bpy.path.abspath(path_value)
        if not os.path.isfile(file_path):
            raise RuntimeError(f"{display_name} path does not exist: {file_path}")
        entries.append(
            {
                "passType": pass_type,
                "name": display_name,
                "imagePath": file_path,
            }
        )
    return entries


def _send_pass_set_to_bridge(context: bpy.types.Context, beauty_path: str):
    settings = context.scene.ai_canvas_bridge_settings
    passes = [
        {
            "passType": "beauty",
            "name": "Beauty",
            "imagePath": beauty_path,
        }
    ]
    passes.extend(_collect_optional_pass_entries(settings))
    stamp = int(time.time() * 1000)
    payload = {
        "source": "blender",
        "kind": "pass_set",
        "passSetId": f"{context.scene.name}_{stamp}",
        "groupName": f"Blender Pass Set ({context.scene.name})",
        "layerName": f"Blender Pass Set ({context.scene.name})",
        "passes": passes,
        "metadata": _scene_metadata(context),
    }
    return _bridge_post(settings.bridge_url, "/v1/render/import-pass-set", payload)


def _collect_sequence_files(settings: bpy.types.PropertyGroup):
    directory = (settings.sequence_dir or "").strip()
    if not directory:
        raise RuntimeError("Sequence directory is empty.")
    resolved_directory = bpy.path.abspath(directory)
    if not os.path.isdir(resolved_directory):
        raise RuntimeError(f"Sequence directory not found: {resolved_directory}")

    pattern = (settings.sequence_pattern or "").strip() or "*.png"
    file_glob = os.path.join(resolved_directory, pattern)
    files = sorted(glob.glob(file_glob))
    files = [path for path in files if os.path.isfile(path)]
    if not files:
        raise RuntimeError(f"No files found for pattern '{pattern}' in {resolved_directory}")
    return files, pattern


def _send_sequence_to_bridge(context: bpy.types.Context):
    settings = context.scene.ai_canvas_bridge_settings
    files, pattern = _collect_sequence_files(settings)
    start_frame = int(settings.sequence_start_frame)
    fps = int(settings.sequence_fps)
    frames = []
    for index, file_path in enumerate(files):
        frame_number = start_frame + index
        time_ms = int(round((index / max(1, fps)) * 1000))
        frames.append(
            {
                "frame": frame_number,
                "timeMs": time_ms,
                "label": os.path.basename(file_path),
                "imagePath": file_path,
            }
        )

    payload = {
        "source": "blender",
        "kind": "sequence",
        "scene": context.scene.name,
        "camera": context.scene.camera.name if context.scene.camera else None,
        "sequenceName": f"{context.scene.name} Sequence",
        "fps": fps,
        "startFrame": start_frame,
        "frames": frames,
        "metadata": {
            **_scene_metadata(context),
            "sequencePattern": pattern,
            "sequenceDir": bpy.path.abspath(settings.sequence_dir),
        },
    }
    return _bridge_post(settings.bridge_url, "/v1/sequence/import", payload)


def _build_camera_state_from_object(context: bpy.types.Context, camera_object: bpy.types.Object):
    scene = context.scene
    percentage = int(scene.render.resolution_percentage)
    width = int(scene.render.resolution_x * percentage / 100)
    height = int(scene.render.resolution_y * percentage / 100)
    lens = float(camera_object.data.lens) if hasattr(camera_object.data, "lens") else None
    return {
        "name": camera_object.name,
        "camera": camera_object.name,
        "frame": int(scene.frame_current),
        "lens": lens,
        "location": [float(camera_object.location.x), float(camera_object.location.y), float(camera_object.location.z)],
        "rotation_euler": [
            float(camera_object.rotation_euler.x),
            float(camera_object.rotation_euler.y),
            float(camera_object.rotation_euler.z),
        ],
        "resolution": {
            "width": width,
            "height": height,
            "percentage": percentage,
        },
    }


def _collect_camera_states(context: bpy.types.Context):
    scene = context.scene
    camera_objects = [obj for obj in scene.objects if obj.type == "CAMERA"]
    states = [_build_camera_state_from_object(context, cam) for cam in camera_objects]
    active_camera = scene.camera.name if scene.camera and scene.camera.type == "CAMERA" else None
    return states, active_camera


def _apply_camera_snapshot(context: bpy.types.Context, snapshot: dict):
    if not snapshot:
        raise RuntimeError("Camera snapshot payload is empty.")

    scene = context.scene
    target_camera_name = snapshot.get("camera")
    target_camera = None

    if isinstance(target_camera_name, str) and target_camera_name.strip():
        target_camera = bpy.data.objects.get(target_camera_name.strip())
        if target_camera and target_camera.type != "CAMERA":
            target_camera = None

    if target_camera is None and scene.camera and scene.camera.type == "CAMERA":
        target_camera = scene.camera

    if target_camera is None:
        camera_objects = [obj for obj in scene.objects if obj.type == "CAMERA"]
        if camera_objects:
            target_camera = camera_objects[0]

    if target_camera is None:
        raise RuntimeError("No camera found in scene to apply snapshot.")

    scene.camera = target_camera

    location = snapshot.get("location")
    if isinstance(location, list) and len(location) >= 3:
        target_camera.location.x = float(location[0])
        target_camera.location.y = float(location[1])
        target_camera.location.z = float(location[2])

    rotation = snapshot.get("rotation_euler")
    if isinstance(rotation, list) and len(rotation) >= 3:
        target_camera.rotation_euler.x = float(rotation[0])
        target_camera.rotation_euler.y = float(rotation[1])
        target_camera.rotation_euler.z = float(rotation[2])

    lens = snapshot.get("lens")
    if lens is not None and hasattr(target_camera.data, "lens"):
        target_camera.data.lens = float(lens)

    frame = snapshot.get("frame")
    if frame is not None:
        scene.frame_set(int(frame))

    resolution = snapshot.get("resolution")
    if isinstance(resolution, dict):
        width = resolution.get("width")
        height = resolution.get("height")
        percentage = resolution.get("percentage")
        if width is not None:
            scene.render.resolution_x = int(width)
        if height is not None:
            scene.render.resolution_y = int(height)
        if percentage is not None:
            scene.render.resolution_percentage = int(percentage)

    return target_camera.name


class AICanvasBridgeSettings(bpy.types.PropertyGroup):
    bridge_url: bpy.props.StringProperty(
        name="Bridge URL",
        description="AI Canvas local bridge endpoint",
        default="http://127.0.0.1:8765",
    )
    seed_override: bpy.props.StringProperty(
        name="Seed Override",
        description="Optional seed value to include in metadata sidecar",
        default="",
    )
    depth_path: bpy.props.StringProperty(name="Depth Pass", subtype="FILE_PATH", default="")
    normal_path: bpy.props.StringProperty(name="Normal Pass", subtype="FILE_PATH", default="")
    albedo_path: bpy.props.StringProperty(name="Albedo Pass", subtype="FILE_PATH", default="")
    object_id_path: bpy.props.StringProperty(name="Object ID Pass", subtype="FILE_PATH", default="")
    material_id_path: bpy.props.StringProperty(name="Material ID Pass", subtype="FILE_PATH", default="")
    sequence_dir: bpy.props.StringProperty(name="Sequence Directory", subtype="DIR_PATH", default="")
    sequence_pattern: bpy.props.StringProperty(
        name="File Pattern",
        description="Glob pattern for frame files (for example *.png, shot_*.png)",
        default="*.png",
    )
    sequence_fps: bpy.props.IntProperty(name="FPS", default=24, min=1, max=240)
    sequence_start_frame: bpy.props.IntProperty(name="Start Frame", default=1, min=0)


class AICANVAS_OT_send_viewport_snapshot(bpy.types.Operator):
    bl_idname = "aicanvas.send_viewport_snapshot"
    bl_label = "Send Viewport Snapshot"
    bl_description = "Capture viewport and send to AI Canvas"

    def execute(self, context):
        try:
            image_path = _temp_png_path("aicanvas_viewport")
            _save_viewport_snapshot(context, image_path)
            response = _send_image_to_bridge(
                context=context,
                image_path=image_path,
                kind="viewport_snapshot",
                layer_name=f"Blender Viewport ({context.scene.name})",
            )
            if not response.get("ok"):
                raise RuntimeError(response.get("message", "Bridge rejected viewport snapshot."))
            self.report({"INFO"}, f"Viewport sent ({response.get('importId', 'queued')})")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class AICANVAS_OT_send_final_render(bpy.types.Operator):
    bl_idname = "aicanvas.send_final_render"
    bl_label = "Send Final Render"
    bl_description = "Save current render result and send to AI Canvas"

    def execute(self, context):
        try:
            image_path = _temp_png_path("aicanvas_final")
            _save_final_render(context, image_path)
            response = _send_image_to_bridge(
                context=context,
                image_path=image_path,
                kind="final_render",
                layer_name=f"Blender Final ({context.scene.name})",
            )
            if not response.get("ok"):
                raise RuntimeError(response.get("message", "Bridge rejected final render."))
            self.report({"INFO"}, f"Final render sent ({response.get('importId', 'queued')})")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class AICANVAS_OT_send_pass_set(bpy.types.Operator):
    bl_idname = "aicanvas.send_pass_set"
    bl_label = "Send Render + Passes"
    bl_description = "Send beauty render and optional pass files to AI Canvas"

    def execute(self, context):
        try:
            beauty_path = _temp_png_path("aicanvas_beauty")
            _save_final_render(context, beauty_path)
            response = _send_pass_set_to_bridge(context, beauty_path)
            if not response.get("ok"):
                raise RuntimeError(response.get("message", "Bridge rejected pass set import."))
            pass_count = int(response.get("passCount") or 1)
            self.report({"INFO"}, f"Pass set sent ({pass_count} pass(es))")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class AICANVAS_OT_send_sequence_frames(bpy.types.Operator):
    bl_idname = "aicanvas.send_sequence_frames"
    bl_label = "Send Sequence Frames"
    bl_description = "Send image sequence from disk to AI Canvas timeline handoff"

    def execute(self, context):
        try:
            response = _send_sequence_to_bridge(context)
            if not response.get("ok"):
                raise RuntimeError(response.get("message", "Bridge rejected sequence import."))
            frame_count = int(response.get("frameCount") or 0)
            sequence_id = response.get("sequenceId", "queued")
            self.report({"INFO"}, f"Sequence sent ({frame_count} frames, {sequence_id})")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class AICANVAS_OT_push_camera_states(bpy.types.Operator):
    bl_idname = "aicanvas.push_camera_states"
    bl_label = "Push Camera States"
    bl_description = "Send named camera states from Blender to AI Canvas"

    def execute(self, context):
        try:
            settings = context.scene.ai_canvas_bridge_settings
            states, active_camera = _collect_camera_states(context)
            payload = {
                "source": "blender",
                "scene": context.scene.name,
                "activeCamera": active_camera,
                "states": states,
            }
            response = _bridge_post(settings.bridge_url, "/v1/camera/states/import", payload)
            if not response.get("ok"):
                raise RuntimeError(response.get("message", "Bridge rejected camera states import."))
            self.report({"INFO"}, f"Pushed {int(response.get('statesCount') or len(states))} camera state(s).")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class AICANVAS_OT_pull_camera_snapshot(bpy.types.Operator):
    bl_idname = "aicanvas.pull_camera_snapshot"
    bl_label = "Pull Camera Snapshot"
    bl_description = "Fetch pending camera snapshot from AI Canvas and apply it to scene camera"

    def execute(self, context):
        try:
            settings = context.scene.ai_canvas_bridge_settings
            response = _bridge_get(settings.bridge_url, "/v1/camera/pending?consume=1")
            if not response.get("ok"):
                raise RuntimeError(response.get("message", "Bridge rejected camera snapshot pull."))

            snapshot = response.get("pendingSnapshot")
            if not snapshot:
                self.report({"WARNING"}, "No pending camera snapshot in bridge.")
                return {"CANCELLED"}

            camera_name = _apply_camera_snapshot(context, snapshot)
            self.report({"INFO"}, f"Applied camera snapshot to '{camera_name}'.")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class AICANVAS_OT_test_bridge(bpy.types.Operator):
    bl_idname = "aicanvas.test_bridge"
    bl_label = "Test Bridge"
    bl_description = "Check if AI Canvas bridge endpoint is reachable"

    def execute(self, context):
        settings = context.scene.ai_canvas_bridge_settings
        base = settings.bridge_url.strip().rstrip("/")
        if not base:
            self.report({"ERROR"}, "Bridge URL is empty.")
            return {"CANCELLED"}
        url = f"{base}/health"
        try:
            with urllib.request.urlopen(url, timeout=4.0) as response:
                payload = json.loads(response.read().decode("utf-8", errors="replace"))
            if payload.get("ok"):
                self.report({"INFO"}, f"Bridge OK ({payload.get('service', 'unknown')})")
                return {"FINISHED"}
            self.report({"ERROR"}, f"Bridge unhealthy: {payload}")
            return {"CANCELLED"}
        except Exception as exc:
            self.report({"ERROR"}, f"Bridge test failed: {exc}")
            return {"CANCELLED"}


class AICANVAS_PT_bridge_panel(bpy.types.Panel):
    bl_label = "AI Canvas Bridge"
    bl_idname = "AICANVAS_PT_bridge_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "AI Canvas"

    def draw(self, context):
        layout = self.layout
        settings = context.scene.ai_canvas_bridge_settings
        layout.prop(settings, "bridge_url")
        layout.prop(settings, "seed_override")
        layout.operator("aicanvas.test_bridge", icon="URL")
        layout.separator()
        layout.operator("aicanvas.send_viewport_snapshot", icon="RESTRICT_RENDER_OFF")
        layout.operator("aicanvas.send_final_render", icon="RENDER_STILL")
        layout.operator("aicanvas.send_pass_set", icon="RENDERLAYERS")
        layout.separator()
        box_camera = layout.box()
        box_camera.label(text="Camera Roundtrip")
        box_camera.operator("aicanvas.push_camera_states", icon="OUTLINER_OB_CAMERA")
        box_camera.operator("aicanvas.pull_camera_snapshot", icon="IMPORT")
        box_sequence = layout.box()
        box_sequence.label(text="Sequence Handoff")
        box_sequence.prop(settings, "sequence_dir")
        box_sequence.prop(settings, "sequence_pattern")
        row = box_sequence.row(align=True)
        row.prop(settings, "sequence_start_frame")
        row.prop(settings, "sequence_fps")
        box_sequence.operator("aicanvas.send_sequence_frames", icon="FILE_IMAGE")
        box = layout.box()
        box.label(text="Optional Pass Files")
        box.prop(settings, "depth_path")
        box.prop(settings, "normal_path")
        box.prop(settings, "albedo_path")
        box.prop(settings, "object_id_path")
        box.prop(settings, "material_id_path")


classes = (
    AICanvasBridgeSettings,
    AICANVAS_OT_send_viewport_snapshot,
    AICANVAS_OT_send_final_render,
    AICANVAS_OT_send_pass_set,
    AICANVAS_OT_send_sequence_frames,
    AICANVAS_OT_push_camera_states,
    AICANVAS_OT_pull_camera_snapshot,
    AICANVAS_OT_test_bridge,
    AICANVAS_PT_bridge_panel,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.ai_canvas_bridge_settings = bpy.props.PointerProperty(type=AICanvasBridgeSettings)


def unregister():
    del bpy.types.Scene.ai_canvas_bridge_settings
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
