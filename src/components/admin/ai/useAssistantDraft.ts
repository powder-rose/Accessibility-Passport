import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminRequestError } from '@/lib/admin-request';
import {
  emptyDraft,
  readDraft,
  writeDraft,
  type AssistantDraft,
  type DraftRevision,
} from './draft-store';
import {
  clearRecovery,
  equalBase,
  loadRecovery,
  revisionBase,
  saveRecovery,
} from './recovery-store';

type Status = 'loading' | 'saved' | 'pending' | 'saving' | 'error';
export function useAssistantDraft() {
  const [draft, setDraft] = useState<AssistantDraft>(emptyDraft);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [hasConflict, setHasConflict] = useState(false);
  const current = useRef(draft);
  const revision = useRef<DraftRevision | null>(null);
  const dirty = useRef(false);
  const conflict = useRef(false);
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<Promise<void> | undefined>(undefined);
  const recoveryQueue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const queueRecovery = useCallback((operation: () => Promise<void>) => {
    const job = recoveryQueue.current.catch(() => {}).then(operation);
    recoveryQueue.current = job;
    return job;
  }, []);
  const persistRecovery = useCallback(() => {
    const base = revision.current && revisionBase(revision.current);
    if (!base) return Promise.resolve();
    const value = structuredClone(current.current);
    return queueRecovery(() => saveRecovery({ base, value }));
  }, [queueRecovery]);
  useEffect(() => {
    mounted.current = true;
    Promise.all([
      readDraft(),
      loadRecovery()
        .then((recovery) => ({ recovery, available: true }))
        .catch(() => ({ recovery: undefined, available: false })),
    ])
      .then(([saved, local]) => {
        const recovery = local.recovery;
        if (!mounted.current) return;
        current.current = saved.value;
        revision.current = saved.revision;
        ready.current = true;
        if (
          recovery &&
          JSON.stringify(recovery.value) !== JSON.stringify(saved.value)
        ) {
          current.current = recovery.value;
          dirty.current = true;
          conflict.current = !equalBase(
            recovery.base,
            revisionBase(saved.revision),
          );
          if (conflict.current) {
            setHasConflict(true);
            setError(
              'Общие материалы изменились в другом браузере. Восстановлен ваш локальный черновик; скачайте копию или сохраните текст вручную перед обновлением.',
            );
            setStatus('error');
          } else setStatus('pending');
        } else {
          if (recovery) void queueRecovery(clearRecovery).catch(() => {});
          setStatus('saved');
          if (!local.available)
            setError(
              'Аварийная копия в браузере недоступна. Общие данные загружены с сайта; не закрывайте окно до сохранения изменений.',
            );
        }
        setDraft(current.current);
      })
      .catch((reason: unknown) => {
        if (!mounted.current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'Не удалось открыть хранилище.',
        );
        setStatus('error');
      });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current || pending.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [queueRecovery]);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!ready.current) throw new Error('Материалы ещё загружаются.');
    if (conflict.current)
      throw new Error(
        'Общие материалы изменились. Сохраните аварийную копию и обновите страницу.',
      );
    if (pending.current) await pending.current;
    if (!dirty.current) return;
    const write = async () => {
      while (dirty.current) {
        const snapshot = current.current;
        dirty.current = false;
        if (mounted.current) setStatus('saving');
        try {
          if (!revision.current) throw new Error('Материалы ещё загружаются.');
          revision.current = await writeDraft(snapshot, revision.current);
          if (dirty.current) await persistRecovery();
        } catch (reason) {
          dirty.current = true;
          if (reason instanceof AdminRequestError && reason.status === 409) {
            conflict.current = true;
            if (mounted.current) setHasConflict(true);
          }
          try {
            await persistRecovery();
          } catch {
            /* report the original save failure */
          }
          const message =
            reason instanceof Error
              ? reason.message
              : 'Не удалось сохранить материалы.';
          if (mounted.current) {
            setError(message);
            setStatus('error');
          }
          throw reason;
        }
      }
      let recoveryCleared = true;
      try {
        await queueRecovery(clearRecovery);
      } catch {
        recoveryCleared = false;
      }
      if (mounted.current) {
        setError(
          recoveryCleared
            ? ''
            : 'Изменения сохранены на сайте, но аварийная копия браузера недоступна.',
        );
        setStatus('saved');
      }
    };
    const task = write();
    pending.current = task;
    try {
      await task;
    } finally {
      if (pending.current === task) pending.current = undefined;
    }
  }, [persistRecovery, queueRecovery]);
  useEffect(() => {
    if (status !== 'pending' || conflict.current) return;
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 3000);
    return () => clearTimeout(timer.current);
  }, [status, flush]);
  const update = useCallback(
    (patch: Partial<AssistantDraft>) => {
      if (!ready.current) return;
      const next = { ...current.current, ...patch };
      current.current = next;
      setDraft(next);
      dirty.current = true;
      setStatus(conflict.current ? 'error' : 'pending');
      void persistRecovery().catch(() => {
        if (mounted.current) {
          setError(
            'Не удалось сохранить аварийную копию в браузере. Не закрывайте окно до сохранения на сайте.',
          );
          setStatus('error');
        }
      });
      clearTimeout(timer.current);
      if (!conflict.current)
        timer.current = setTimeout(() => {
          void flush().catch(() => {});
        }, 3000);
    },
    [flush, persistRecovery],
  );
  const overwriteAfterConflict = useCallback(async () => {
    if (!conflict.current || !dirty.current) return;
    const latest = await readDraft();
    revision.current = latest.revision;
    conflict.current = false;
    setHasConflict(false);
    await persistRecovery();
    await flush();
  }, [flush, persistRecovery]);
  return {
    draft,
    current,
    status,
    error,
    flush,
    update,
    hasConflict,
    overwriteAfterConflict,
  };
}
