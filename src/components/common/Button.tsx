import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', children, className = '', style, ...props }: ButtonProps) {
  const base = 'inline-flex items-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'text-white',
    secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200',
    ghost: 'hover:bg-slate-100 text-slate-600 hover:text-slate-800',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  const primaryStyle = variant === 'primary'
    ? { background: 'linear-gradient(135deg, #7c3aed, #0d9488)', ...style }
    : style;

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} style={primaryStyle} {...props}>
      {children}
    </button>
  );
}
