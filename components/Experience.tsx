import React, { useEffect, useRef, useState } from 'react';
import { EXPERIENCES } from '../constants';
import type { Experience } from '../types';

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

interface ExperienceCardProps {
  item: Experience;
}

const ExperienceCard: React.FC<ExperienceCardProps> = ({ item }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isVisible = useOnScreen(ref, "-100px");

  return (
    <div
      ref={ref}
      className={`relative pl-8 transition-all duration-700 ease-out ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
      }`}
    >
      <div className="timeline-item">
        <p className="text-sm text-neutral-400 mb-1">{item.date}</p>
        <h3 className="text-lg font-bold text-teal-400">{item.title}</h3>
        <p className="font-semibold mb-3">{item.company}</p>
        <ul className="list-disc list-inside text-neutral-300 space-y-1">
          {item.description.map((desc, index) => <li key={index}>{desc}</li>)}
        </ul>
      </div>
    </div>
  );
};

const Experience: React.FC = () => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isTitleVisible = useOnScreen(titleRef, "-100px");
  
  return (
    <section id="experience" className="py-24">
      <h2
        ref={titleRef}
        className={`text-3xl font-bold text-center mb-12 transition-all duration-500 ${
          isTitleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        Work Experience
      </h2>
      <div className="relative border-l-2 border-teal-500/30 ml-3 space-y-12">
        {EXPERIENCES.map((item, index) => (
          <ExperienceCard key={index} item={item} />
        ))}
      </div>
    </section>
  );
};

export default Experience;