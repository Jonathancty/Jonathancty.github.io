import React, { useEffect, useRef, useState } from 'react';

const useOnScreen = <T extends Element,>(ref: React.RefObject<T>, rootMargin: string = "0px"): boolean => {
    const [isIntersecting, setIntersecting] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                setIntersecting(entry.isIntersecting);
            },
            {
                rootMargin,
            }
        );
        if (ref.current) {
            observer.observe(ref.current);
        }
        return () => {
            if(ref.current) {
                 observer.unobserve(ref.current);
            }
        };
    }, [ref, rootMargin]);

    return isIntersecting;
};

const Resume: React.FC = () => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const resumeRef = useRef<HTMLDivElement>(null);
  const isTitleVisible = useOnScreen(titleRef, "-100px");
  const isResumeVisible = useOnScreen(resumeRef, "-100px");

  return (
    <section id="resume" className="py-24 text-center">
      <h2
        ref={titleRef}
        className={`text-3xl font-bold mb-8 transition-all duration-500 ${
          isTitleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        My Resume
      </h2>
      <div
        ref={resumeRef}
        className={`max-w-4xl mx-auto transition-all duration-700 ease-out ${
          isResumeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg shadow-lg">
          <img 
            src="/images/Jonathan_Chan_CV_2026-1.png" 
            alt="Preview of CV" 
            className="rounded-md w-full max-w-2xl mx-auto"
          />
        </div>
        <a 
          href="/Jonathan_Chan_CV_2026.pdf" // Replace with your actual CV file path
          download="Jonathan_Chan.pdf"
          className="mt-8 inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-teal-600 hover:bg-teal-700 transition-transform duration-300 hover:scale-105"
        >
          Download CV
          <svg xmlns="http://www.w3.org/2000/svg" className="ml-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      </div>
    </section>
  );
};

export default Resume;