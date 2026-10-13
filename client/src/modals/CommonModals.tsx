import { useEffect, useRef, useState } from 'react';
import { ui, type ModalSpec } from '../store/ui';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';
import { errorMessage } from '../lib/api';

export function ConfirmModal({ spec }: { spec: Extract<ModalSpec, { type: 'confirm' }> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={spec.title}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={ui.closeModal}>취소</button>
          <button
            className={`btn ${spec.danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            autoFocus
            onClick={async () => {
              setBusy(true);
              try {
                await spec.onConfirm();
                ui.closeModal();
              } catch (err) {
                ui.error(err);
                setBusy(false);
              }
            }}
          >
            {busy ? '처리 중…' : spec.confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-text">{spec.message}</p>
    </Modal>
  );
}

export function PromptModal({ spec }: { spec: Extract<ModalSpec, { type: 'prompt' }> }) {
  const [value, setValue] = useState(spec.initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await spec.onSubmit(value.trim());
      ui.closeModal();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Modal title={spec.title} size="sm">
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>{spec.label}</span>
          <input className="input" value={value} maxLength={spec.maxLength ?? 40} onChange={(e) => setValue(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-footer inline">
          <button type="button" className="btn btn-ghost" onClick={ui.closeModal}>취소</button>
          <button className="btn btn-primary" disabled={busy || !value.trim()}>{spec.confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

/** 원형 미리보기로 이미지를 정사각형으로 자르는 편집기 (드래그로 이동, 슬라이더/휠로 확대) */
export function CropModal({ spec }: { spec: Extract<ModalSpec, { type: 'cropImage' }> }) {
  const VIEW = 280;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const url = useRef<string>('');

  useEffect(() => {
    url.current = URL.createObjectURL(spec.file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => {
      ui.toast('이미지를 열 수 없어요.', 'error');
      ui.closeModal();
    };
    image.src = url.current;
    return () => URL.revokeObjectURL(url.current);
  }, [spec.file]);

  const base = img ? VIEW / Math.min(img.width, img.height) : 1;
  const scale = base * zoom;
  const w = img ? img.width * scale : 0;
  const h = img ? img.height * scale : 0;
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(VIEW - w, o.x)),
    y: Math.min(0, Math.max(VIEW - h, o.y)),
  });
  useEffect(() => {
    if (img) setOffset(clamp({ x: (VIEW - w) / 2, y: (VIEW - h) / 2 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img]);
  const setZoomKeepCenter = (z: number) => {
    const nz = Math.min(4, Math.max(1, z));
    const cx = (VIEW / 2 - offset.x) / scale;
    const cy = (VIEW / 2 - offset.y) / scale;
    const ns = base * nz;
    setZoom(nz);
    setOffset({
      x: Math.min(0, Math.max(VIEW - img!.width * ns, VIEW / 2 - cx * ns)),
      y: Math.min(0, Math.max(VIEW - img!.height * ns, VIEW / 2 - cy * ns)),
    });
  };

  const done = async () => {
    if (!img) return;
    setBusy(true);
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sw = VIEW / scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sw, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) {
      setBusy(false);
      return;
    }
    try {
      await spec.onDone(blob);
      ui.closeModal();
    } catch (err) {
      ui.error(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={spec.title}
      subtitle="드래그해서 위치를 맞추고, 확대해서 원하는 부분을 골라 주세요."
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={ui.closeModal}>취소</button>
          <button className="btn btn-primary" onClick={() => void done()} disabled={!img || busy}>{busy ? '올리는 중…' : '적용'}</button>
        </>
      }
    >
      <div
        className="crop-area"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setOffset(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }));
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => img && setZoomKeepCenter(zoom - e.deltaY * 0.002)}
      >
        {img ? <img src={url.current} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(${offset.x}px, ${offset.y}px)` }} /> : <span className="spinner" />}
        <div className="crop-mask" />
      </div>
      <div className="crop-zoom">
        <Icon name="image" size={14} />
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => img && setZoomKeepCenter(Number(e.target.value))} aria-label="확대" />
        <Icon name="image" size={20} />
      </div>
    </Modal>
  );
}

/** 파일 선택 → 자르기 모달 */
export function pickAndCrop(title: string, onDone: (blob: Blob) => Promise<void>) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      ui.toast('이미지는 8MB까지 올릴 수 있어요.', 'error');
      return;
    }
    ui.openModal({ type: 'cropImage', file, title, onDone });
  };
  input.click();
}
