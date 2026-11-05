import { Arrow } from '../site/primitives';
export default function UpdateAction({
  children,
  review = false,
  quiz = false,
  className = 'text-link',
}: {
  children: React.ReactNode;
  review?: boolean;
  quiz?: boolean;
  className?: string;
}) {
  return (
    <a
      href={quiz ? '#quiz' : '?service=update#contact'}
      className={className}
      data-goal={review ? 'update_review_click' : 'update_order_click'}
      {...(quiz
        ? { 'data-quiz': '', 'data-quiz-service': 'update' }
        : { 'data-order': 'update' })}
    >
      {children}
      <Arrow />
    </a>
  );
}
