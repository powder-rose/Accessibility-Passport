import { useEffect, useRef, useState } from 'react';
import type { Answers, SiteContent, Section } from '@/lib/content-types';
import { Arrow, CheckList } from '../site/primitives';
import ContactFields, { Consent, formContacts } from './ContactFields';
import { useLeadSubmission } from './useLeadSubmission';
import { documentationForService, serviceFromAnswers } from '@/lib/service-intent';
import { track } from '@/lib/analytics';
export default function ExpressCheck({
  content,
  objectType,
  initialService,
  section: sectionOverride,
}: {
  content: SiteContent;
  objectType?: string;
  initialService?: string;
  section?: Section;
}) {
  const config = content.quiz;
  const section = sectionOverride || content.sections['5'];
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(() => {
    const documentation = documentationForService(initialService);
    return {
      ...(objectType ? { objectType: [objectType] } : {}),
      ...(documentation ? { documentation: [documentation] } : {}),
    };
  });
  const started = useRef(false);
  const contactDraft = useRef({ name: '', phone: '', email: '', consent: false });
  const focusTarget = useRef<HTMLHeadingElement>(null);
  const submission = useLeadSubmission();
  const question = config.questions[step];
  const total = config.questions.length + 1;
  useEffect(() => {
    const choose = (e: Event) => {
      const value = (e as CustomEvent<string>).detail;
      if (
        config.questions.find((x) => x.id === 'objectType')?.options.some((o) => o.id === value)
      ) {
        setAnswers((a) => ({ ...a, objectType: [value] }));
        setStep(config.questions.findIndex((x) => x.id === 'objectType'));
      }
    };
    const chooseService = (e: Event) => {
      const value = documentationForService((e as CustomEvent<string>).detail);
      if (
        value &&
        config.questions
          .find((q) => q.id === 'documentation')
          ?.options.some((option) => option.id === value)
      ) {
        setAnswers((old) => ({ ...old, documentation: [value] }));
        setStep(0);
      }
    };
    window.addEventListener('select-object', choose);
    window.addEventListener('select-quiz-service', chooseService);
    return () => {
      window.removeEventListener('select-object', choose);
      window.removeEventListener('select-quiz-service', chooseService);
    };
  }, [config.questions]);
  function begin() {
    if (!started.current) {
      track('express_check_start', location.pathname, content.site.metrikaId);
      started.current = true;
    }
  }
  function next() {
    begin();
    track(`express_check_step_${step + 1}`, location.pathname, content.site.metrikaId);
    setStep((s) => Math.min(s + 1, total - 1));
    setTimeout(() => focusTarget.current?.focus(), 0);
  }
  function select(value: string) {
    begin();
    setAnswers((old) => {
      const prev = old[question.id] || [];
      return {
        ...old,
        [question.id]: question.multiple
          ? prev.includes(value)
            ? prev.filter((x) => x !== value)
            : [...prev, value]
          : [value],
      };
    });
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
    setTimeout(() => focusTarget.current?.focus(), 0);
  }
  if (!config.enabled) return null;
  return (
    <section className="section express" id="quiz">
      <div className="container express-grid">
        <div className="express-intro">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
          <p>{section.description}</p>
          {!!section.benefits?.length && (
            <>
              <h3>Что определим после проверки</h3>
              <CheckList items={section.benefits} />
            </>
          )}
          {section.note && <p className="express-disclaimer">{section.note}</p>}
        </div>
        <div className="quiz-panel" aria-live="polite">
          {submission.success ? (
            <div className="quiz-success">
              <span className="success-mark" aria-hidden="true">
                ✓
              </span>
              <h3>{config.successTitle}</h3>
              <p>{config.successText}</p>
              <a href="#top" className="button button-primary">
                Вернуться на страницу
                <Arrow />
              </a>
            </div>
          ) : (
            <>
              <div className="quiz-status">
                <span>Экспресс-проверка ОСИ</span>
                <span>
                  Шаг {step + 1} / {total}
                </span>
              </div>
              <progress
                className="quiz-progress"
                value={step + 1}
                max={total}
                aria-label={`Шаг ${step + 1} из ${total}`}
              />
              {step < config.questions.length ? (
                <div key={question.id} className="quiz-question">
                  <h3 ref={focusTarget} tabIndex={-1}>
                    {question.title}
                  </h3>
                  {question.hint && <p className="quiz-hint">{question.hint}</p>}
                  <fieldset
                    className={
                      question.options.length > 6
                        ? 'quiz-options quiz-options--grid'
                        : 'quiz-options'
                    }
                  >
                    <legend className="sr-only">{question.title}</legend>
                    {question.options.map((option) => (
                      <label
                        key={option.id}
                        className={
                          (answers[question.id] || []).includes(option.id)
                            ? 'quiz-option selected'
                            : 'quiz-option'
                        }
                      >
                        <input
                          type={question.multiple ? 'checkbox' : 'radio'}
                          name={question.id}
                          value={option.id}
                          checked={(answers[question.id] || []).includes(option.id)}
                          onChange={() => select(option.id)}
                        />
                        <span className="option-indicator" />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>
                  <div className="quiz-controls">
                    <button
                      className="back-button"
                      type="button"
                      onClick={back}
                      disabled={step === 0}
                    >
                      ← Назад
                    </button>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={next}
                      disabled={question.required && !answers[question.id]?.length}
                    >
                      Продолжить
                      <Arrow diagonal={false} />
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  method="post"
                  action="/api/leads"
                  onChange={(e) => {
                    contactDraft.current = formContacts(e.currentTarget);
                  }}
                  className="quiz-contact"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const contacts = formContacts(e.currentTarget);
                    if (
                      await submission.submit({
                        ...contacts,
                        source: 'express',
                        answers,
                        service: serviceFromAnswers(answers.documentation),
                      })
                    ) {
                      track('express_check_submit', location.pathname, content.site.metrikaId);
                    }
                  }}
                >
                  <h3 ref={focusTarget} tabIndex={-1}>
                    Куда направить результат проверки?
                  </h3>
                  <p>
                    Оставьте контактные данные. Специалист изучит ответы и свяжется с вами по
                    вопросу разработки документации.
                  </p>
                  <ContactFields prefix="quiz" defaults={contactDraft.current} />
                  <Consent prefix="quiz" defaultChecked={contactDraft.current.consent} />
                  {submission.error && (
                    <p className="form-error" role="alert">
                      {submission.error}
                    </p>
                  )}
                  <div className="quiz-controls">
                    <button
                      type="button"
                      className="back-button"
                      onClick={back}
                      disabled={submission.pending}
                    >
                      ← Назад
                    </button>
                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={submission.pending}
                    >
                      {submission.pending ? 'Отправка…' : 'Получить результат проверки'}
                      <Arrow />
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
