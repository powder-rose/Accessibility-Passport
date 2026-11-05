import ServiceGlyph from '../service/ServiceGlyph';

export default function DataFlowGraphic() {
  return (
    <div className="questionnaire-data-flow" aria-hidden="true">
      <div className="questionnaire-data-flow__inputs">
        {(['building', 'people', 'route'] as const).map((name) => (
          <span key={name}>
            <ServiceGlyph name={name} />
          </span>
        ))}
      </div>
      <svg viewBox="0 0 160 180" fill="none" preserveAspectRatio="none">
        <path d="M0 25h28c45 0 30 65 90 65h42M0 90h160M0 155h28c45 0 30-65 90-65" />
        <circle cx="118" cy="90" r="4" />
      </svg>
      <span className="questionnaire-data-flow__result">
        <ServiceGlyph name="document" />
      </span>
    </div>
  );
}
