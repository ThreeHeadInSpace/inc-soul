import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "denied"
  | "unavailable"
  | "error";

export type FacingMode = "user" | "environment";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
  const [canSwitch, setCanSwitch] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const start = useCallback(async (mode: FacingMode = facingMode) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      setMessage("Этот браузер не умеет открывать камеру. Загрузите кадры с устройства.");
      return;
    }

    setStatus("requesting");
    setMessage("Запрашиваем доступ к камере…");
    stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);
      }
      setFacingMode(mode);
      setStatus("ready");
      setMessage("");

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCanSwitch(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch {
        setCanSwitch(false);
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
        setStatus("denied");
        setMessage("Нет доступа к камере. Разрешите её в браузере или загрузите фото.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") {
        setStatus("unavailable");
        setMessage("Камера не найдена или занята. Можно загрузить кадры с устройства.");
      } else {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Не удалось открыть камеру.");
      }
    }
  }, [facingMode, stop]);

  const switchCamera = useCallback(() => {
    const next: FacingMode = facingMode === "user" ? "environment" : "user";
    return start(next);
  }, [facingMode, start]);

  useEffect(() => () => stop(), [stop]);

  return {
    videoRef,
    status,
    message,
    facingMode,
    canSwitch,
    start,
    stop,
    switchCamera,
  };
}
