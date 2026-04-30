import { Link } from 'react-router-dom';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  linkTo?: string;
}

const sizeClasses = {
  sm: 'h-6',
  md: 'h-8',
  lg: 'h-12',
};

const textSizeClasses = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
};

export default function Logo({ className = '', size = 'md', linkTo = '/' }: LogoProps) {
  const content = (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 32 32"
        className={`${sizeClasses[size]} aspect-square`}
        aria-label="Next59 logo"
      >
        <rect width="32" height="32" rx="6" fill="#0f1d2a" />
        <path
          d="M9 8 L9 24 L12 24 L12 13.5 L20 24 L23 24 L23 8 L20 8 L20 18.5 L12 8 Z"
          fill="#ffffff"
        />
        <circle cx="25" cy="7" r="2.5" fill="#F2A623" />
      </svg>
      <span
        className={`${textSizeClasses[size]} font-semibold tracking-tight`}
        style={{ color: '#F2A623' }}
      >
        Next59
      </span>
    </span>
  );

  if (linkTo) {
    return (
      <Link to={linkTo} className="inline-flex hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
