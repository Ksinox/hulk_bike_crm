export interface Testimonial {
  id: number;
  name: string;
  avatar: string;
  role: string;
  rating: number;
  text: string;
  income: {
    before: number;
    after: number;
  };
  date: string;
  likes: number;
  phone: string;
  isVideo?: boolean;
  videoUrl?: string;
  videoThumbnail?: string;
}