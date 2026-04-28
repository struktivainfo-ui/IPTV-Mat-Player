import React, { useEffect, useRef, useState } from "react";

export default function Player({ src, autoplay, onProgress, onStatus, onEnded, onDiagnostic, tvMode, preferHls = false }) {
  const ref = useRef(null);
  const hlsRef = useRef(null);
  const onProgressRef = useRef(onProgress);
  const onStatusRef = useRef(onStatus);
  const onEndedRef = useRef(onEnded);
  const onDiagnosticRef = useRef(onDiagnostic);
  const [error, setError] = useState("");
  const [buffering, setBuffering] = useState(false);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    onDiagnosticRef.current = onDiagnostic;
  }, [onDiagnostic]);

  useEffect(() => {
    let cancelled = false;
    const video = ref.current;

    if (!video || !src) {
      return undefined;
    }

    setError("");
    setBuffering(true);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.pause();
    video.removeAttribute("src");
    video.load();

    const handleTimeUpdate = () => {
      if (video.duration && Number.isFinite(video.duration)) {
        onProgressRef.current?.(Math.round((video.currentTime / video.duration) * 100));
      }
    };
    const handleReady = () => {
      setBuffering(false);
      onStatusRef.current?.("Player bereit.");
      onDiagnosticRef.current?.({ state: "ready", lastUrl: src, lastError: "", updatedAt: Date.now() });
    };
    const handleFail = (message) => {
      setBuffering(false);
      setError(message);
      onStatusRef.current?.(message);
      onDiagnosticRef.current?.({ state: "error", lastUrl: src, lastError: message, updatedAt: Date.now() });
    };
    const handleEnded = () => {
      onEndedRef.current?.();
      onStatusRef.current?.("Wiedergabe beendet.");
      onDiagnosticRef.current?.({ state: "ended", lastUrl: src, lastError: "", updatedAt: Date.now() });
    };
    const handleWaiting = () => {
      setBuffering(true);
      onDiagnosticRef.current?.({ state: "buffering", lastUrl: src, lastError: "", updatedAt: Date.now() });
    };
    const handlePlaying = () => {
      setBuffering(false);
      onDiagnosticRef.current?.({ state: "playing", lastUrl: src, lastError: "", updatedAt: Date.now() });
    };
    const handleNativeError = () => handleFail("Video-Element konnte den Stream nicht abspielen.");

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("canplay", handleReady);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleNativeError);

    (async () => {
      if (preferHls || src.toLowerCase().includes(".m3u8") || src.toLowerCase().includes("output=m3u8")) {
        const { default: Hls } = await import("hls.js");

        if (cancelled) {
          return;
        }

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
            maxBufferLength: 30,
          });

          hls.loadSource(src);
          hls.attachMedia(video);
          hlsRef.current = hls;
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data?.fatal) {
              return;
            }

            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }

            handleFail("HLS-Stream konnte nicht geladen werden.");
          });
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            handleReady();
            if (autoplay) {
              video.play().catch(() => {});
            }
          });
          return;
        }
      }

      video.src = src;
      video.load();
      if (autoplay) {
        video.play().catch(() => {});
      }
    })().catch(() => handleFail("Wiedergabe konnte nicht vorbereitet werden."));

    return () => {
      cancelled = true;
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("canplay", handleReady);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleNativeError);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoplay, preferHls]);

  function fullscreen() {
    const video = ref.current;
    if (video?.requestFullscreen) {
      video.requestFullscreen().catch(() => {});
    }
  }

  return (
    <div className={`playerWrap ${tvMode ? "playerTv" : ""}`}>
      <video ref={ref} controls playsInline className="player" />
      {tvMode ? (
        <button className="tvFullBtn" onClick={fullscreen}>
          TV Vollbild
        </button>
      ) : null}
      {buffering ? <div className="playerOverlay">Buffering ...</div> : null}
      {error ? <div className="errorBox">{error}</div> : null}
    </div>
  );
}
