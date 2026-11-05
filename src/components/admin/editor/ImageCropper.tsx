import { useEffect, useRef, useState } from 'react';
import { uploadImage } from '../articles/api';
import type { ArticleImage } from '@/features/articles/model';

const width = 1200,
  height = 675;
const clamp = (value: number) => Math.max(-100, Math.min(100, value));
export default function ImageCropper({
  source,
  onClose,
  onUploaded,
}: {
  source: string;
  onClose: () => void;
  onUploaded: (image: ArticleImage) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | undefined>(undefined);
  const drag = useRef<
    { x: number; y: number; left: number; top: number } | undefined
  >(undefined);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    const bitmap = new window.Image();
    bitmap.onload = () => {
      if (
        !bitmap.naturalWidth ||
        bitmap.naturalWidth * bitmap.naturalHeight > 40000000
      ) {
        setError(
          'Изображение слишком большое. Используйте файл до 40 мегапикселей.',
        );
        return;
      }
      image.current = bitmap;
      setReady(true);
    };
    bitmap.onerror = () => setError('Не удалось открыть изображение.');
    bitmap.src = source;
    return () => {
      bitmap.onload = null;
      bitmap.onerror = null;
    };
  }, [source]);
  function metrics() {
    const bitmap = image.current!;
    const scale =
      Math.max(width / bitmap.naturalWidth, height / bitmap.naturalHeight) *
      zoom;
    return {
      bitmap,
      w: bitmap.naturalWidth * scale,
      h: bitmap.naturalHeight * scale,
    };
  }
  useEffect(() => {
    if (!ready || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    const { bitmap, w, h } = metrics();
    context.clearRect(0, 0, width, height);
    context.drawImage(
      bitmap,
      (width - w) / 2 + ((position.x / 100) * (w - width)) / 2,
      (height - h) / 2 + ((position.y / 100) * (h - height)) / 2,
      w,
      h,
    );
  }, [ready, zoom, position]);
  async function apply() {
    if (!canvas.current || !ready) return;
    setPending(true);
    setError('');
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.current!.toBlob(resolve, 'image/webp', 0.9),
      );
      if (!blob) throw new Error('Не удалось подготовить изображение.');
      const result = await uploadImage(
        new File([blob], 'article-cover.webp', { type: 'image/webp' }),
      );
      onUploaded(result);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить изображение.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="editor-dialog editor-cropper"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <h2>Обложка статьи</h2>
      <p>1200 × 675 px · 16:9</p>
      <canvas
        ref={canvas}
        width={width}
        height={height}
        aria-label="Предпросмотр обрезки"
        onPointerDown={(event) => {
          if (!ready || pending) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: position.x,
            top: position.y,
          };
        }}
        onPointerMove={(event) => {
          if (!drag.current || !ready) return;
          const { w, h } = metrics();
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({
            x: clamp(
              drag.current.left +
                (w > width
                  ? ((((event.clientX - drag.current.x) / rect.width) * width) /
                      ((w - width) / 2)) *
                    100
                  : 0),
            ),
            y: clamp(
              drag.current.top +
                (h > height
                  ? ((((event.clientY - drag.current.y) / rect.height) *
                      height) /
                      ((h - height) / 2)) *
                    100
                  : 0),
            ),
          });
        }}
        onPointerUp={() => {
          drag.current = undefined;
        }}
        onLostPointerCapture={() => {
          drag.current = undefined;
        }}
      />
      <div className="editor-cropper__controls">
        <label>
          Масштаб
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            disabled={pending}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <label>
          По горизонтали
          <input
            type="range"
            min={-100}
            max={100}
            value={position.x}
            disabled={pending}
            onChange={(event) =>
              setPosition((old) => ({ ...old, x: Number(event.target.value) }))
            }
          />
        </label>
        <label>
          По вертикали
          <input
            type="range"
            min={-100}
            max={100}
            value={position.y}
            disabled={pending}
            onChange={(event) =>
              setPosition((old) => ({ ...old, y: Number(event.target.value) }))
            }
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="editor-dialog__actions">
        <button type="button" disabled={pending} onClick={onClose}>
          Отмена
        </button>
        <button type="button" disabled={!ready || pending} onClick={apply}>
          {pending ? 'Загрузка…' : 'Применить обрезку'}
        </button>
      </div>
    </dialog>
  );
}
