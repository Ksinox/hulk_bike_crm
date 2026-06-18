import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

/**
 * Анимированный градиент-наполнитель круга загрузки (ShaderGradient / Three.js).
 * Вынесен в ОТДЕЛЬНЫЙ файл и грузится через React.lazy → Three.js уезжает в
 * свой чанк и не тянет основной бандл. Конфиг (waterPlane, фиолетово-коралловый)
 * — как просил заказчик. pointer-events off: круг сам по себе кнопка.
 */
export default function LiquidGradient() {
  return (
    <ShaderGradientCanvas
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      pointerEvents="none"
      pixelDensity={1}
      fov={40}
    >
      <ShaderGradient
        control="props"
        type="waterPlane"
        animate="on"
        color1="#5606ff"
        color2="#fe8989"
        color3="#000000"
        uSpeed={0.3}
        uStrength={1.6}
        uDensity={1.8}
        uFrequency={0}
        uTime={8}
        positionX={0}
        positionY={0}
        positionZ={0}
        rotationX={50}
        rotationY={0}
        rotationZ={-60}
        cAzimuthAngle={180}
        cPolarAngle={80}
        cDistance={2.6}
        cameraZoom={9.1}
        brightness={1.3}
        grain="off"
        enableTransition={false}
      />
    </ShaderGradientCanvas>
  );
}
