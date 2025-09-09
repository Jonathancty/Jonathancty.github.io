
import React from 'react';
import { SOCIAL_LINKS } from '../constants';

const Contact: React.FC = () => {
  return (
    <footer id="contact" className="bg-neutral-950 border-t border-neutral-800 py-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl font-bold mb-4">Get In Touch</h2>
        <p className="text-neutral-400 max-w-xl mx-auto mb-8">
          I'm currently seeking new opportunities and would love to hear from you. Whether you have a question or just want to say hi, feel free to reach out.
        </p>
        <a
          href="mailto:jonathan05cty@gmail.com"
          className="text-lg text-teal-400 hover:text-teal-300 transition-colors"
        >
          jonathan05cty@gmail.com
        </a>
        <div className="mt-8 flex justify-center space-x-6">
          {SOCIAL_LINKS.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-white transition-transform duration-300 hover:scale-110"
            >
              {link.icon}
            </a>
          ))}
        </div>
        <div className="mt-12 text-sm text-neutral-500">
          <p>&copy; {new Date().getFullYear()} Jonathan Chan. All rights reserved.</p>
          {/* <p className="mt-1">Built with React & Tailwind CSS</p> */}
        </div>
      </div>
    </footer>
  );
};

export default Contact;