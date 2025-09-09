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

const Education: React.FC = () => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isTitleVisible = useOnScreen(titleRef, "-100px");
  const isCardVisible = useOnScreen(cardRef, "-100px");

  return (
    <section id="education" className="py-24">
      <h2
        ref={titleRef}
        className={`text-3xl font-bold text-center mb-12 transition-all duration-500 ${
          isTitleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        Education
      </h2>
      <div
        ref={cardRef}
        className={`bg-neutral-900/50 p-8 rounded-lg border border-neutral-800 max-w-2xl mx-auto text-center shadow-lg transition-all duration-500 ease-out ${
          isCardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <h3 className="text-xl font-semibold text-teal-400">Durham University</h3>
        <p className="mt-2 text-lg">BSc in Computer Science</p>
        <p className="mt-1 text-neutral-400">2023 - 2026</p>
        <p className="mt-4 text-neutral-300">
          Relevant Modules: Algorithms & Data Structures, Software Engineering, Artificial Intelligence, Data Science, Network and Systems.
        </p>
      </div>
      <div className="bg-neutral-900/50 p-8 rounded-lg border border-neutral-800 max-w-2xl mx-auto text-center shadow-lg mt-8">
        <h3 className="text-xl font-semibold text-teal-400">Wah Yan College Hong Kong</h3>
        <p className="mt-2 text-lg">HKDSE</p>
        <p className="mt-1 text-neutral-400">2017 - 2023</p>
        <p className="mt-4 text-neutral-300">
          Achievements: Ranked top 1% in Mathematics (5**), top 3.1% in Hong Kong for best 5 subjects (Extended Maths, Physics, Chemistry, ICT). 
        </p>
      </div>
    </section>
  );
};

export default Education;