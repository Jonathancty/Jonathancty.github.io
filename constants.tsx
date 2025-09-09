
import React from 'react';
import type { Skill, Experience, Project } from './types';

export const SKILLS: Skill[] = [
  { name: 'Python', level: 95 },
  { name: 'JavaScript', level: 90 },
  { name: 'HTML, CSS', level: 90 },
  { name: 'React', level: 65 },
  { name: 'Node.js', level: 90 },
  { name: 'SQL', level: 80 },
  { name: 'Java', level: 60 },
  { name: 'C and C++', level: 60 },
];

export const EXPERIENCES: Experience[] = [
  {
    date: 'July 2024 - August 2024',
    title: 'Engineering Intern',
    company: 'The Walt Disney Company',
    description: [
      'Built Power Apps for Facility Services (bidding, change requests, etc.)',
      'Automated maintenance planning, reducing manual errors',
      'Integrated Power Apps/Automate with company systems for data consistency',
      'Helped set up IoT for Disney boat ride using LoRa and NAS',
      'Presented on Machine Learning trends in business'
    ],
  },
  {
    date: 'July 2023 - August 2023',
    title: 'Event Organizer',
    company: 'Yan Kwong Social Service Center',
    description: [
      'Managed youth info for certificates and health records',
      'Organized activities for 30-40 children',
      'Led team to design and run events for children'
    ],
  },
];

export const PROJECTS: Project[] = [
  {
    title: 'Auto Trading System',
    description: 'An automated trading platform that combines sentiment analysis with technical analysis to optimize buy and sell timing. The system analyzes market sentiment from news and social media alongside technical indicators, enabling smarter, data-driven trading decisions and improved profitability.',
    imageUrl: '/images/auto_trading_system.png',
    tags: ['Python', 'GoogleAPI', 'InteractiveBroker'],
    liveUrl: '#',
    repoUrl: 'https://github.com/Jonathancty/AutoTrader',
  },
  {
    title: 'AI recommendation System',
    description: 'Our AI-powered recommendation system helps university students find society activities that match their interests and schedules, providing personalized event suggestions to boost campus engagement.',
    imageUrl: '/images/AI_recommendation.png',
    tags: ['Python', 'Scikit-Learn', 'Machine Learning'],
    liveUrl: '#',
    repoUrl: 'https://github.com/Jonathancty/AI-recommender',
  },
  {
    title: 'Machine Learning Paper',
    description: 'This research paper applies advanced regression methods in machine learning to solve real-world problems, showing how predictive modeling delivers insights across healthcare, finance, engineering, and social sciences.',
    imageUrl: '/images/machine_learning.png',
    tags: ['Python', 'Scikit-Learn', 'Machine Learning'],
    liveUrl: '#',
    previewUrl: '/Machine_Learning_watermark.pdf',
  },
];

export const SOCIAL_LINKS = [
  {
    name: 'GitHub',
    url: 'https://github.com/jonathancty',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
      </svg>
    ),
  },
  {
    name: 'LinkedIn',
    url: 'http://www.linkedin.com/in/jonathanctyyy',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
        <rect x="2" y="9" width="4" height="12"></rect>
        <circle cx="4" cy="4" r="2"></circle>
      </svg>
    ),
  },
  {
    name: 'Discord',
    url: 'https://discordapp.com/users/6654',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.447.864-.614 1.249a18.214 18.214 0 0 0-5.487 0c-.167-.385-.403-.874-.614-1.249a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.683 4.369a.07.07 0 0 0-.032.027C.533 8.159-.319 11.87.099 15.539a.082.082 0 0 0 .031.056c2.073 1.523 4.085 2.453 6.092 3.084a.077.077 0 0 0 .084-.027c.469-.646.885-1.329 1.241-2.049a.076.076 0 0 0-.041-.104c-.662-.251-1.294-.549-1.91-.892a.077.077 0 0 1-.008-.128c.128-.096.256-.192.378-.291a.074.074 0 0 1 .077-.01c4.009 1.826 8.343 1.826 12.313 0a.074.074 0 0 1 .078.009c.122.099.25.195.378.291a.077.077 0 0 1-.006.128c-.617.343-1.249.641-1.911.892a.076.076 0 0 0-.04.105c.36.719.776 1.402 1.24 2.049a.076.076 0 0 0 .084.028c2.009-.631 4.021-1.561 6.093-3.084a.077.077 0 0 0 .031-.055c.5-4.09-.838-7.765-3.185-11.143a.061.061 0 0 0-.031-.028zM8.02 14.331c-.789 0-1.438-.724-1.438-1.614 0-.89.637-1.614 1.438-1.614.807 0 1.45.732 1.438 1.614 0 .89-.637 1.614-1.438 1.614zm7.974 0c-.789 0-1.438-.724-1.438-1.614 0-.89.637-1.614 1.438-1.614.807 0 1.45.732 1.438 1.614 0 .89-.637 1.614-1.438 1.614z"></path>
      </svg>
    ),
  },
];
