import React, { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { SKILLS } from '../constants';

const COLORS = ['#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4']; // Teal color scheme

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


const Skills: React.FC = () => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const isTitleVisible = useOnScreen(titleRef, "-100px");
  const isChartVisible = useOnScreen(chartRef, "-100px");
  
  return (
    <section id="skills" className="py-24">
      <h2
        ref={titleRef}
        className={`text-3xl font-bold text-center mb-12 transition-all duration-500 ${
          isTitleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        My Technical Skills
      </h2>
      <div
        ref={chartRef}
        className={`w-full h-96 transition-all duration-700 ease-out ${
          isChartVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <ResponsiveContainer>
          <BarChart data={SKILLS} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              width={100} 
              tickLine={false} 
              axisLine={false} 
              stroke="#a3a3a3"
            />
            <Tooltip
              cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
              contentStyle={{
                backgroundColor: '#1f2937',
                borderColor: '#374151',
                borderRadius: '0.5rem',
              }}
              labelStyle={{ color: '#f5f5f5' }}
            />
            <Bar dataKey="level" barSize={20} radius={[0, 10, 10, 0]}>
              {SKILLS.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

export default Skills;