export interface Location {
  id: number;
  name: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  workingHours: string;
  phone: string;
}

export interface ContactMethod {
  type: string;
  value: string;
  icon: string;
  primary?: boolean;
}