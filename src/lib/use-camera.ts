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
  const requestRef = useRef(0);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
  const [canSwitch, setCanSwitch] = useState(false);

  const stop = useCallback(() => {
    requestRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const start = useCallback(async (mode: FacingMode = facingMode) => {
    const switching = mode !== facingMode;
    stop();
    const request = requestRef.current;
    setCanSwitch(false);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      setMessage("Камера недоступна в этом браузере. Откройте сайт по HTTPS в браузере с поддержкой камеры или загрузите фото.");
      return;
    }

    setStatus("requesting");
    setMessage("Запрашиваем доступ к камере…");

    try {
      const acquire = (requested: FacingMode, exact: boolean) => navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: exact ? { exact: requested } : { ideal: requested },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      let switchFailed = false;
      let stream: MediaStream;
      try {
        stream = await acquire(mode, switching);
      } catch (err) {
        if (request !== requestRef.current) return;
        if (!switching) throw err;
        switchFailed = true;
        stream = await acquire(facingMode, false);
      }
      if (request !== requestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const actualMode = stream.getVideoTracks()[0]?.getSettings().facingMode;
      if (switching && actualMode !== mode) switchFailed = true;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
      }
      if (request !== requestRef.current) return;
      setFacingMode(actualMode === "environment" ? "environment" : "user");
      setStatus("ready");
      setMessage(switchFailed ? "Переключить камеру не удалось. Продолжайте с доступной камерой." : "");

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (request !== requestRef.current) return;
        setCanSwitch(!switchFailed &&
          (actualMode === "user" || actualMode === "environment") &&
          navigator.mediaDevices.getSupportedConstraints().facingMode === true &&
          devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch {
        if (request === requestRef.current) setCanSwitch(false);
      }
    } catch (err) {
      if (request !== requestRef.current) return;
      stop();
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
        setStatus("denied");
        setMessage("Доступ к камере запрещён. Разрешите камеру в настройках сайта в браузере и повторите попытку.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
        setStatus("unavailable");
        setMessage("Подходящая камера не найдена. Подключите камеру и повторите попытку или загрузите фото.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setStatus("unavailable");
        setMessage("Камера занята или недоступна. Закройте другие приложения с камерой и повторите попытку.");
      } else {
        setStatus("error");
        setMessage("Не удалось запустить камеру. Повторите попытку или загрузите фото с устройства.");
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
