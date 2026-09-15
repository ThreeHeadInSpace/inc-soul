import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "error";
export type FacingMode = "user" | "environment";

// Permission requests cannot be aborted. Serialize across unmount/remount and
// release stale streams before another camera screen acquires its stream.
let pendingAcquisition: Promise<MediaStream | null> | null = null;
async function acquireCamera(constraints: MediaStreamConstraints, current: () => boolean) {
  while (pendingAcquisition) {
    try { await pendingAcquisition; } catch { /* The next request may retry. */ }
  }
  if (!current()) return null;
  const pending = navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    if (current()) return stream;
    stream.getTracks().forEach((track) => track.stop());
    return null;
  });
  pendingAcquisition = pending;
  try { return await pending; } finally {
    if (pendingAcquisition === pending) pendingAcquisition = null;
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);
  const pendingRef = useRef<{ request: number; promise: Promise<void> } | null>(null);
  const facingRef = useRef<FacingMode>("user");
  const wantedRef = useRef(false);
  const backgroundRef = useRef(false);
  const detachRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [message, setMessage] = useState("");
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
  const [canSwitch, setCanSwitch] = useState(false);

  const stop = useCallback(() => {
    wantedRef.current = false;
    requestRef.current += 1;
    detachRef.current?.();
    detachRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback((mode: FacingMode = facingRef.current): Promise<void> => {
    if (pendingRef.current?.request === requestRef.current) return pendingRef.current.promise;
    const previousMode = facingRef.current;
    const switching = mode !== previousMode;
    if (!switching && streamRef.current?.getVideoTracks().some((track) => track.readyState === "live")) return Promise.resolve();
    stop();
    wantedRef.current = true;
    const request = requestRef.current;
    const current = () => request === requestRef.current;
    const run = async () => {
      setCanSwitch(false);
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        setMessage("Камера недоступна в этом браузере. Откройте сайт по HTTPS в браузере с поддержкой камеры или загрузите фото.");
        return;
      }
      setStatus("requesting");
      setMessage(switching ? "Переключаем камеру…" : "Разрешите доступ к камере в запросе браузера…");
      try {
        const acquire = (requested: FacingMode, exact: boolean) => acquireCamera({
          audio: false,
          video: { facingMode: exact ? { exact: requested } : { ideal: requested }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        }, current);
        let switchFailed = false;
        let stream: MediaStream | null;
        try { stream = await acquire(mode, switching); } catch (error) {
          if (!current()) return;
          const name = error instanceof Error ? error.name : "";
          if (!switching || ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) throw error;
          switchFailed = true;
          stream = await acquire(previousMode, false);
        }
        if (!stream) return;
        if (!current()) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const actualMode = track?.getSettings().facingMode;
        if (switching && actualMode !== mode) switchFailed = true;
        facingRef.current = actualMode === "environment" ? "environment" : "user";
        setFacingMode(facingRef.current);
        const switchMessage = switchFailed ? "Переключить камеру не удалось. Продолжайте с доступной камерой." : "";
        const video = videoRef.current;
        const markReady = () => {
          if (!current() || backgroundRef.current || document.hidden || track?.muted || track?.readyState !== "live") return;
          if (video && video.readyState >= 2 && video.videoWidth > 0) {
            setStatus("ready");
            setMessage(switchMessage);
          }
        };
        const onInterrupted = () => {
          if (!current()) return;
          setStatus(track?.readyState === "ended" ? "unavailable" : "requesting");
          setMessage("Камера приостановлена. Вернитесь к съёмке или повторите запуск.");
        };
        track?.addEventListener("ended", onInterrupted);
        track?.addEventListener("mute", onInterrupted);
        track?.addEventListener("unmute", markReady);
        video?.addEventListener("playing", markReady);
        video?.addEventListener("loadeddata", markReady);
        video?.addEventListener("resize", markReady);
        detachRef.current = () => {
          track?.removeEventListener("ended", onInterrupted);
          track?.removeEventListener("mute", onInterrupted);
          track?.removeEventListener("unmute", markReady);
          video?.removeEventListener("playing", markReady);
          video?.removeEventListener("loadeddata", markReady);
          video?.removeEventListener("resize", markReady);
        };
        setMessage("Запускаем изображение с камеры…");
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          if (!backgroundRef.current && !document.hidden) await video.play();
        }
        if (!current()) return;
        markReady();
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (current()) setCanSwitch(!switchFailed &&
            (actualMode === "user" || actualMode === "environment") &&
            navigator.mediaDevices.getSupportedConstraints().facingMode === true &&
            devices.filter((device) => device.kind === "videoinput").length > 1);
        } catch { if (current()) setCanSwitch(false); }
      } catch (error) {
        if (!current()) return;
        // iOS may interrupt play() on backgrounding while the track stays live.
        if ((backgroundRef.current || document.hidden) && streamRef.current) return;
        stop();
        const name = error instanceof Error ? error.name : "";
        if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) {
          setStatus("denied");
          setMessage("Доступ к камере запрещён. Разрешите камеру в настройках сайта в браузере и повторите попытку.");
        } else if (["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"].includes(name)) {
          setStatus("unavailable");
          setMessage("Подходящая камера не найдена. Подключите камеру и повторите попытку или загрузите фото.");
        } else if (["NotReadableError", "TrackStartError"].includes(name)) {
          setStatus("unavailable");
          setMessage("Камера занята или недоступна. Закройте другие приложения с камерой и повторите попытку.");
        } else {
          setStatus("error");
          setMessage("Не удалось запустить камеру. Повторите попытку или загрузите фото с устройства.");
        }
      }
    };
    const promise = run();
    pendingRef.current = { request, promise };
    void promise.finally(() => { if (pendingRef.current?.promise === promise) pendingRef.current = null; });
    return promise;
  }, [stop]);

  useEffect(() => {
    const hide = () => {
      backgroundRef.current = true;
      videoRef.current?.pause();
    };
    const resume = () => {
      if (document.hidden) return;
      backgroundRef.current = false;
      if (!wantedRef.current) return;
      const stream = streamRef.current;
      const video = videoRef.current;
      if (!stream) return;
      if (!stream.getVideoTracks().some((track) => track.readyState === "live")) {
        void start();
        return;
      }
      if (!video) return;
      if (video.srcObject !== stream) video.srcObject = stream;
      const request = requestRef.current;
      void video.play().catch(() => {
        if (request !== requestRef.current || backgroundRef.current) return;
        stop();
        setStatus("error");
        setMessage("Не удалось возобновить камеру. Повторите запуск.");
      });
    };
    const visibility = () => { if (document.hidden) hide(); else resume(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", resume);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", resume);
      stop();
    };
  }, [start, stop]);

  const switchCamera = useCallback(() => start(facingRef.current === "user" ? "environment" : "user"), [start]);
  return { videoRef, status, message, facingMode, canSwitch, start, stop, switchCamera };
}
