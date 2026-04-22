import React from 'react';

interface SectionHeadingProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionHeading({ children, className = '' }: SectionHeadingProps) {
  const text = typeof children === 'string' ? children : '';
  
  return (
    <h2 
      className={`heading-style text-3xl md:text-4xl mb-6 md:mb-8 text-center ${className}`}
      data-text={text}
    >
      {children}
    </h2>
  );
}