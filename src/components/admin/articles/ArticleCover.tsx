import { useEffect, useRef, useState } from 'react';
import { imageSelectionError } from './api';
import ImageCropper from '../editor/ImageCropper';

export default function ArticleCover({
  image,
  alt,
  onChange,
  disabled,
}: {
  image: string;
  alt: string;
  onChange: (image: string) => void;
  disabled: boolean;
}) {
  const [source, setSource] = useState('');
  const active = useRef('');
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      if (active.current) URL.revokeObjectURL(active.current);
    },
    [],
  );
  function close() {
    if (active.current) URL.revokeObjectURL(active.current);
    active.current = '';
    setSource('');
  }
  return (
    <div className="article-cover-field">
      <span>Главное изображение</span>
      <label className="editor-upload-control">
        Выбрать изображение
        <input
          type="file"
          aria-label="Главное изображение"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            const problem = imageSelectionError(file);
            setError(problem);
            if (problem) return;
            close();
            active.current = URL.createObjectURL(file);
            setSource(active.current);
          }}
        />
      </label>
      <small>JPG, PNG, WEBP · до 5 МБ · обрезка 16:9</small>
      {image && (
        <div className="article-cover-field__preview">
          <img
            src={image}
            alt={alt || 'Превью изображения статьи'}
            width={1200}
            height={675}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('')}
          >
            Удалить изображение
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {source && (
        <ImageCropper
          source={source}
          onClose={close}
          onUploaded={(image) => {
            onChange(image.url);
            close();
          }}
        />
      )}
    </div>
  );
}
