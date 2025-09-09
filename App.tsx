
import React from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import Skills from './components/Skills';
import Education from './components/Education';
import Experience from './components/Experience';
import Resume from './components/Resume';
import Projects from './components/Projects';
import Contact from './components/Contact';

const App: React.FC = () => {
  return (
    <div className="bg-[#0a0a0a] text-neutral-200">
      <Header />
      <main>
        <Hero />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Skills />
          <Education />
          <Experience />
          <Resume />
          <Projects />
        </div>
        <Contact />
      </main>
    </div>
  );
};

export default App;
