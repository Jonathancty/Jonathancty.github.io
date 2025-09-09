
export interface Skill {
  name: string;
  level: number;
}

export interface Experience {
  date: string;
  title: string;
  company: string;
  description: string[];
}

export interface Project {
  title: string;
  description: string;
  imageUrl: string;
  tags: string[];
  liveUrl?: string;
  repoUrl?: string;
  previewUrl?: string;
}
