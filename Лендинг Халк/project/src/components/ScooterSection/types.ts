export interface Scooter {
  id: number;
  name: string;
  price: number;
  specs: {
    engine: string;
    cooling: string;
    maxSpeed: number;
    fuelTank: number;
    seats: number;
    weight: number;
    engineVolume: number;
    length: number;
    width: number;
    height: number;
    wheelbase: number;
    tires: {
      front: string;
      rear: string;
    };
  };
  image: string;
}