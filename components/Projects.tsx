import React, { useEffect, useRef, useState } from 'react';
import { PROJECTS } from '../constants';
import type { Project } from '../types';

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

const ProjectCard: React.FC<{ project: Project; index: number }> = ({ project, index }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const isVisible = useOnScreen(cardRef, "-100px");

  return (
    <div
      ref={cardRef}
      className={`bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden group transform hover:-translate-y-2 transition-all duration-500 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <img src={project.imageUrl} alt={project.title} className="w-full h-48 object-cover" />
      <div className="p-6">
        <h3 className="text-xl font-bold mb-2">{project.title}</h3>
        <p className="text-neutral-400 mb-4">{project.description}</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {project.tags.map((tag) => (
            <span key={tag} className="bg-teal-900/50 text-teal-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex space-x-4 mt-auto">
          {/* {project.liveUrl && (
            <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 font-medium">
              Live Demo
            </a>
          )} */}
          {project.repoUrl && (
            <a href={project.repoUrl} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 font-medium">
              GitHub
            </a>
          )}
          {project.previewUrl && (
            <a href={project.previewUrl} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 font-medium">
              Preview
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

const Projects: React.FC = () => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isTitleVisible = useOnScreen(titleRef, "-100px");
  
  return (
    <section id="projects" className="py-24">
      <h2
        ref={titleRef}
        className={`text-3xl font-bold text-center mb-12 transition-all duration-500 ${
          isTitleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        Personal Projects
      </h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {PROJECTS.map((project, index) => (
          <ProjectCard key={index} project={project} index={index} />
        ))}
      </div>
    </section>
  );
};

export default Projects;