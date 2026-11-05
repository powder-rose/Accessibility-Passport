export default function AccessDiagram() {
  return (
    <svg
      className="access-diagram"
      viewBox="0 0 480 240"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="access-diagram__plane"
        d="m48 185 220-91 165 73-222 64Z"
      />
      <path
        className="access-diagram__building"
        d="M113 158V51h177v108l-89 38Z"
      />
      <path className="access-diagram__side" d="m290 51 75 34v107l-75-33Z" />
      <path
        className="access-diagram__line"
        d="M113 158V51h177l75 34v107l-75-33M290 51v108l-89 38-88-39M140 74h28v37h-28Zm49 0h28v37h-28Zm49 0h28v37h-28ZM174 178v-47h46v56"
      />
      <path
        className="access-diagram__ramp"
        d="m220 169 132 43 22-12-154-50Z"
      />
      <path
        className="access-diagram__accent"
        d="m220 149 154 50m-154-66 154 50m-143-46v15m131 26v17M161 188l-16 7m27-2-16 7m27-2-16 7"
      />
      <path
        className="access-diagram__guide"
        d="M71 39h43M71 39v43m317 112v29h-39"
      />
      <circle className="access-diagram__point" cx="374" cy="200" r="5" />
    </svg>
  );
}
