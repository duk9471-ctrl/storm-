import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, extend, Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, Instance, Instances, shaderMaterial } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useTreeStore } from '../store';

// --- Shared GLSL ---
const noiseGLSL = `
    // Simplex Noise (simplified)
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
      const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
      const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx) ;
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute( permute( permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
      float n_ = 0.142857142857;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                    dot(p2,x2), dot(p3,x3) ) );
    }
`;

// --- Custom Shaders ---

const SparkleMaterial = shaderMaterial(
  {
    uTime: 0,
    uColorStart: new THREE.Color('#022D36'),
    uColorEnd: new THREE.Color('#00ff88'),
    uSize: 0.15,
    uProgress: 0
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform float uSize;
    uniform float uProgress;
    attribute vec3 targetPosition;
    attribute float aRandom;
    varying vec3 vPosition;
    varying float vAlpha;

    ${noiseGLSL}

    void main() {
      vPosition = position;
      
      // Interpolate between tree form (position) and scatter form (targetPosition)
      vec3 mixedPos = mix(position, targetPosition, uProgress);
      
      // Add some noise movement when scattered
      float noise = snoise(vec3(mixedPos.x * 0.5, mixedPos.y * 0.5, uTime * 0.5));
      mixedPos += noise * uProgress * 0.5;

      vec4 mvPosition = modelViewMatrix * vec4(mixedPos, 1.0);
      gl_PointSize = uSize * (20.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
      
      vAlpha = 1.0 - uProgress * 0.3; // Fade slightly when scattered
    }
  `,
  // Fragment Shader
  `
    uniform float uTime;
    uniform vec3 uColorStart;
    uniform vec3 uColorEnd;
    varying float vAlpha;

    void main() {
      float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
      if (distanceToCenter > 0.5) discard;

      // Sparkling effect
      float sparkle = sin(uTime * 5.0 + gl_PointCoord.x * 10.0) * 0.5 + 0.5;
      vec3 color = mix(uColorStart, uColorEnd, sparkle);

      gl_FragColor = vec4(color, vAlpha);
    }
  `
);

// New Material for Colored Bulbs
const ColoredTwinkleMaterial = shaderMaterial(
  {
    uTime: 0,
    uSize: 0.4,
    uProgress: 0
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform float uSize;
    uniform float uProgress;
    attribute vec3 targetPosition;
    attribute vec3 color; 
    varying vec3 vColor;
    varying float vAlpha;
    varying vec3 vPosition;

    ${noiseGLSL}

    void main() {
      vColor = color;
      vPosition = position;
      
      vec3 mixedPos = mix(position, targetPosition, uProgress);
      float noise = snoise(vec3(mixedPos.x * 0.5, mixedPos.y * 0.5, uTime * 0.5));
      mixedPos += noise * uProgress * 0.5;
      
      vec4 mvPosition = modelViewMatrix * vec4(mixedPos, 1.0);
      gl_PointSize = uSize * (30.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
      
      vAlpha = 1.0 - uProgress * 0.1; 
    }
  `,
  // Fragment Shader
  `
    uniform float uTime;
    varying vec3 vColor;
    varying float vAlpha;
    varying vec3 vPosition;

    void main() {
      float d = distance(gl_PointCoord, vec2(0.5));
      if (d > 0.5) discard;

      // Randomized blinking based on spatial position
      float phase = dot(vPosition, vec3(12.989, 78.233, 45.164)); 
      float blink = sin(uTime * 4.0 + phase) * 0.5 + 0.5;
      
      // Core glow for bloom
      float core = 1.0 - smoothstep(0.0, 0.5, d);
      
      // Boost brightness for bloom
      vec3 finalColor = vColor * (0.8 + 2.0 * blink);

      gl_FragColor = vec4(finalColor, vAlpha * core);
    }
  `
);

// --- Snow Material ---
const SnowMaterial = shaderMaterial(
  {
    uTime: 0,
    uWind: 0,
    uColor: new THREE.Color('#ffffff'),
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform float uWind;
    attribute float aSize;
    attribute float aFallSpeed;
    varying float vAlpha;

    void main() {
      vec3 pos = position;
      
      // Endless fall logic
      float fallDistance = uTime * aFallSpeed;
      float height = 25.0; // The vertical range of the snow
      
      // Wrap Y: The initial range is roughly -12.5 to 12.5. 
      // We subtract fall distance and modulo to keep it in range.
      pos.y = 12.5 - mod(uTime * aFallSpeed + (12.5 - pos.y), height);
      
      // Wind/Gesture Interaction
      // Use rotation velocity (uWind) to push particles sideways
      pos.x += pos.y * uWind * 0.5; 
      pos.z += sin(uTime + pos.y) * uWind * 0.2;

      // Spiral effect if wind is strong
      if (abs(uWind) > 0.1) {
         float angle = uWind * uTime * 0.5;
         float c = cos(angle);
         float s = sin(angle);
         float nx = pos.x * c - pos.z * s;
         float nz = pos.x * s + pos.z * c;
         pos.x = nx;
         pos.z = nz;
      }

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      
      // Size attenuation
      gl_PointSize = aSize * (50.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
      
      // Fade out at top and bottom edges
      float edgeFade = smoothstep(12.0, 8.0, abs(pos.y));
      vAlpha = 0.6 * edgeFade;
    }
  `,
  // Fragment Shader
  `
    uniform vec3 uColor;
    varying float vAlpha;

    void main() {
      // Soft circular glow
      float d = distance(gl_PointCoord, vec2(0.5));
      if (d > 0.5) discard;
      
      // Radial Gradient for Glow
      float alpha = smoothstep(0.5, 0.0, d);
      
      gl_FragColor = vec4(uColor, vAlpha * alpha);
    }
  `
);

// --- Dust Material (Ambient Background Particles) ---
const DustMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#D4AF37'), // Gold
  },
  // Vertex Shader
  `
    uniform float uTime;
    varying float vAlpha;

    void main() {
      vec3 pos = position;
      
      // Slow, organic movement
      float t = uTime * 0.15;
      pos.x += sin(t + pos.y * 0.5) * 0.3;
      pos.y += cos(t + pos.x * 0.5) * 0.3;
      pos.z += sin(t + pos.z * 0.5) * 0.3;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = (20.0 / -mvPosition.z); // Small size, attenuated by depth
      gl_Position = projectionMatrix * mvPosition;
      
      // Twinkle/Fade
      vAlpha = 0.3 + 0.3 * sin(uTime * 1.0 + pos.x * 100.0);
    }
  `,
  // Fragment Shader
  `
    uniform vec3 uColor;
    varying float vAlpha;

    void main() {
      float d = distance(gl_PointCoord, vec2(0.5));
      if (d > 0.5) discard;
      // Very soft edge
      float alpha = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(uColor, alpha * vAlpha);
    }
  `
);

// --- Glow Particle Material (New: Atmospheric aura) ---
const GlowParticleMaterial = shaderMaterial(
    {
        uTime: 0,
        uColor: new THREE.Color('#ffdb70'), // Warm bright gold
    },
    // Vertex
    `
    uniform float uTime;
    attribute float aSize;
    attribute vec3 aRandom;
    varying float vAlpha;
    
    void main() {
        vec3 pos = position;
        
        // Complex floating motion based on randomization
        float t = uTime * 0.3;
        pos.x += sin(t + aRandom.y) * 0.4;
        pos.y += cos(t + aRandom.x) * 0.4;
        pos.z += sin(t + aRandom.z) * 0.4;
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = aSize * (40.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        
        // Breathing alpha
        vAlpha = 0.4 + 0.4 * sin(uTime * 1.5 + aRandom.x * 10.0);
    }
    `,
    // Fragment
    `
    uniform vec3 uColor;
    varying float vAlpha;
    void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        if (d > 0.5) discard;
        // Soft Glow profile
        float strength = pow(1.0 - d * 2.0, 2.0);
        gl_FragColor = vec4(uColor, vAlpha * strength);
    }
    `
);

extend({ SparkleMaterial, ColoredTwinkleMaterial, SnowMaterial, DustMaterial, GlowParticleMaterial });

// --- Helper Math ---

const COUNT = 12000; // Increased count for dense, lush look
const TREE_HEIGHT = 14;
const TREE_RADIUS = 5;

const getRandomSpherePoint = (r: number) => {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.sin(phi) * Math.sin(theta);
  const z = r * Math.cos(phi);
  return [x, y, z] as [number, number, number];
};

const getLevitationPoint = (baseRadius: number) => {
    // Generate a point in a large spherical volume to avoid clumping (Chaos mode)
    // We use spherical coordinates to distribute widely in 3D space.
    
    // 1. Random Direction (Uniform Sphere)
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1); 
    
    // 2. Random Distance (Volumetric)
    // Updated: Increased multiplier to allow wide dispersion as requested
    const minR = baseRadius;
    const maxR = baseRadius * 3.0; // Increased to 3.0x for wide scatter
    const distance = minR + Math.random() * (maxR - minR);

    const x = distance * Math.sin(phi) * Math.cos(theta);
    const y = distance * Math.sin(phi) * Math.sin(theta);
    const z = distance * Math.cos(phi);
    
    return [x, y, z] as [number, number, number];
}

// Deprecated in favor of inline logic in Needles for volume filling, but kept if needed by others
const getTreePoint = (i: number, total: number) => {
  const y = (i / total) * TREE_HEIGHT - (TREE_HEIGHT / 2); // -7 to 7
  const radiusAtHeight = ((TREE_HEIGHT / 2 - y) / TREE_HEIGHT) * TREE_RADIUS;
  const theta = i * 0.5; // Spiral
  const r = radiusAtHeight;
  const x = r * Math.cos(theta);
  const z = r * Math.sin(theta);
  return [x, y, z] as [number, number, number];
};

// --- Components ---

const TreeStar = () => {
    const groupRef = useRef<THREE.Group>(null);
    const progress = useTreeStore(state => state.progress);
    
    // Create a 5-pointed Star Shape
    const starShape = useMemo(() => {
        const shape = new THREE.Shape();
        const points = 5;
        const outerRadius = 1.2; 
        const innerRadius = 0.5;
        
        for (let i = 0; i < points * 2; i++) {
            const r = (i % 2 === 0) ? outerRadius : innerRadius;
            // Angle adjustment to point star upwards (-PI/2)
            const angle = (i / (points * 2)) * Math.PI * 2 - (Math.PI / 2); 
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        }
        shape.closePath();
        return shape;
    }, []);

    const extrudeSettings = useMemo(() => ({
        depth: 0.3,
        bevelEnabled: true,
        bevelThickness: 0.1,
        bevelSize: 0.05,
        bevelSegments: 2
    }), []);

    useFrame(({ clock }) => {
        if (groupRef.current) {
            const t = clock.getElapsedTime();
            
            // Spin logic
            groupRef.current.rotation.y = t * 0.5;

            // Levitate slightly when scattered
            const baseY = (TREE_HEIGHT / 2 + 0.8);
            const scatterOffset = (progress * 2) + Math.sin(t) * 0.2 * progress;
            groupRef.current.position.y = baseY + scatterOffset;

            // Subtle pulsing scale
            const scale = 1 + Math.sin(t * 2) * 0.05;
            groupRef.current.scale.set(scale, scale, scale);
        }
    });

    return (
        <group ref={groupRef} position={[0, TREE_HEIGHT / 2 + 0.8, 0]}>
            <mesh position={[0, 0, -0.15]}> {/* Center extrusion on Z axis */}
                <extrudeGeometry args={[starShape, extrudeSettings]} />
                <meshStandardMaterial 
                    color="#FFD700" 
                    emissive="#FFD700" 
                    emissiveIntensity={3} 
                    toneMapped={false}
                    roughness={0.1}
                    metalness={1.0}
                />
            </mesh>
            
            {/* Emitter Light */}
            <pointLight intensity={5} distance={20} color="#FFD700" decay={2} />
        </group>
    );
};

const InnerGlow = () => {
    const materialRef = useRef<THREE.SpriteMaterial>(null);
    
    const glowTexture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
            // Core
            gradient.addColorStop(0, 'rgba(255, 215, 0, 1)'); 
            // Mid glow (Warm Orange)
            gradient.addColorStop(0.25, 'rgba(255, 140, 0, 0.5)'); 
            // Outer Fade
            gradient.addColorStop(0.6, 'rgba(184, 134, 11, 0.1)'); 
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 512, 512);
        }
        return new THREE.CanvasTexture(canvas);
    }, []);

    useFrame(({ clock }) => {
        if (materialRef.current) {
            // Subtle breathing of the halo
            materialRef.current.opacity = 0.7 + Math.sin(clock.elapsedTime * 1.2) * 0.2;
        }
    });

    return (
        <sprite position={[0, 0, 0]} scale={[12, 12, 1]}>
            <spriteMaterial 
                ref={materialRef} 
                map={glowTexture} 
                transparent 
                blending={THREE.AdditiveBlending} 
                depthWrite={false}
                toneMapped={false} // Allow bloom to pick it up
            />
        </sprite>
    );
};

const SnowParticles = () => {
    const count = 5000; // Increased count for dense, lush look
    const materialRef = useRef<any>(null);
    const rotationVelocity = useTreeStore(state => state.rotationVelocity);

    const { positions, sizes, speeds } = useMemo(() => {
        const p = new Float32Array(count * 3);
        const s = new Float32Array(count);
        const sp = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            // Random box area around tree (slightly expanded for atmosphere)
            p[i * 3] = (Math.random() - 0.5) * 35;     // x
            p[i * 3 + 1] = (Math.random() - 0.5) * 35; // y
            p[i * 3 + 2] = (Math.random() - 0.5) * 35; // z

            // VARIATION FOR ATMOSPHERE:
            // 85% Small "Dust" Snow (Background)
            // 12% Medium Flakes
            // 3% Large "Bokeh" Flakes (Foreground feel)
            const r = Math.random();
            if (r > 0.97) {
                s[i] = Math.random() * 1.5 + 1.0; 
            } else if (r > 0.85) {
                s[i] = Math.random() * 0.5 + 0.4;
            } else {
                s[i] = Math.random() * 0.2 + 0.1;
            }
            
            sp[i] = Math.random() * 1.5 + 0.5; // Speed varied
        }
        return { positions: p, sizes: s, speeds: sp };
    }, []);

    useFrame(({ clock }) => {
        if (materialRef.current) {
            materialRef.current.uTime = clock.getElapsedTime();
            // Smoothly interpolate wind based on rotation velocity
            materialRef.current.uWind = THREE.MathUtils.lerp(
                materialRef.current.uWind, 
                rotationVelocity * 20.0, // Amplify velocity for visual effect
                0.05
            );
        }
    });

    return (
        <points>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-aSize" count={count} array={sizes} itemSize={1} />
                <bufferAttribute attach="attributes-aFallSpeed" count={count} array={speeds} itemSize={1} />
            </bufferGeometry>
            {/* @ts-ignore */}
            <snowMaterial 
                ref={materialRef} 
                transparent 
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                uColor={new THREE.Color('#fffaf0')} // Floral White/Gold tint
            />
        </points>
    );
};

const GlowingParticles = () => {
    const count = 300;
    const materialRef = useRef<any>(null);

    const { positions, randoms, sizes } = useMemo(() => {
        const p = new Float32Array(count * 3);
        const r = new Float32Array(count * 3);
        const s = new Float32Array(count);
        for(let i=0; i<count; i++) {
            // Cylindrical distribution around tree
            const radius = 2.0 + Math.random() * 6.0;
            const theta = Math.random() * Math.PI * 2;
            const y = (Math.random() - 0.5) * 16.0;

            p[i*3] = radius * Math.cos(theta);
            p[i*3+1] = y;
            p[i*3+2] = radius * Math.sin(theta);
            
            r[i*3] = Math.random();
            r[i*3+1] = Math.random();
            r[i*3+2] = Math.random();
            
            s[i] = 0.5 + Math.random() * 1.5;
        }
        return { positions: p, randoms: r, sizes: s };
    }, []);

    useFrame(({ clock }) => {
        if (materialRef.current) {
            materialRef.current.uTime = clock.getElapsedTime();
        }
    });

    return (
        <points>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-aRandom" count={count} array={randoms} itemSize={3} />
                <bufferAttribute attach="attributes-aSize" count={count} array={sizes} itemSize={1} />
            </bufferGeometry>
            {/* @ts-ignore */}
            <glowParticleMaterial 
                ref={materialRef} 
                transparent 
                depthWrite={false} 
                blending={THREE.AdditiveBlending} 
            />
        </points>
    );
};

const DustParticles = () => {
    const count = 400; // Low count for ambient effect
    const materialRef = useRef<any>(null);
    
    const positions = useMemo(() => {
        const p = new Float32Array(count * 3);
        for(let i=0; i<count; i++) {
             // Random volume filling the screen view
             p[i*3] = (Math.random() - 0.5) * 35;
             p[i*3+1] = (Math.random() - 0.5) * 35;
             p[i*3+2] = (Math.random() - 0.5) * 35;
        }
        return p;
    }, []);

    useFrame(({ clock }) => {
        if (materialRef.current) {
            materialRef.current.uTime = clock.getElapsedTime();
        }
    });

    return (
        <points>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            </bufferGeometry>
            {/* @ts-ignore */}
            <dustMaterial 
                ref={materialRef} 
                transparent 
                depthWrite={false} 
                blending={THREE.AdditiveBlending} 
            />
        </points>
    );
};

const Needles = () => {
  const progress = useTreeStore(state => state.progress);
  const materialRef = useRef<any>(null);
  
  const [positions, targetPositions, randoms] = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const target = new Float32Array(COUNT * 3);
    const rnd = new Float32Array(COUNT);
    
    for (let i = 0; i < COUNT; i++) {
      // Tree Shape - Enhanced to fill volume and empty spaces
      
      // 1. Determine height (Top to bottom)
      const ratio = i / COUNT;
      const y = ratio * TREE_HEIGHT - (TREE_HEIGHT / 2);
      
      // 2. Max radius at this height
      const rMax = ((TREE_HEIGHT / 2 - y) / TREE_HEIGHT) * TREE_RADIUS;
      
      // 3. Angular position (Golden Angle for even, non-repeating packing)
      const theta = i * 2.39996; 
      
      // 4. Volume Filling: 
      // Instead of placing all points on the surface (r = rMax),
      // we distribute them within a thick shell (30% to 100% of radius).
      // sqrt(random) gives a uniform distribution by area, so it doesn't bunch up in the center.
      const rRandom = 0.3 + 0.7 * Math.sqrt(Math.random()); 
      const r = rMax * rRandom;

      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);

      // Add slight jitter for organic messiness
      pos[i * 3] = x + (Math.random() - 0.5) * 0.2;
      pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.2;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.2;

      // Scatter Shape (Levitation)
      // PUSH TO PERIPHERY: Increased radius to 20 to clear center for photos
      const [sx, sy, sz] = getLevitationPoint(20); 
      target[i * 3] = sx;
      target[i * 3 + 1] = sy;
      target[i * 3 + 2] = sz;

      rnd[i] = Math.random();
    }
    return [pos, target, rnd];
  }, []);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uTime = clock.getElapsedTime();
      materialRef.current.uProgress = THREE.MathUtils.lerp(materialRef.current.uProgress, progress, 0.05);
    }
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-targetPosition" count={COUNT} array={targetPositions} itemSize={3} />
        <bufferAttribute attach="attributes-aRandom" count={COUNT} array={randoms} itemSize={1} />
      </bufferGeometry>
      {/* @ts-ignore */}
      <sparkleMaterial 
        ref={materialRef} 
        transparent 
        depthWrite={false} 
        blending={THREE.AdditiveBlending}
        uColorStart={new THREE.Color('#034f1d')} // Deep Emerald
        uColorEnd={new THREE.Color('#D4AF37')}   // Gold
        uSize={0.12} // Reduced slightly for higher density
      />
    </points>
  );
};

const ColoredBulbs = () => {
  const progress = useTreeStore(state => state.progress);
  const materialRef = useRef<any>(null);
  const BULB_COUNT = 250;

  const [positions, targetPositions, colors] = useMemo(() => {
    const pos = new Float32Array(BULB_COUNT * 3);
    const target = new Float32Array(BULB_COUNT * 3);
    const cols = new Float32Array(BULB_COUNT * 3);
    
    // Updated Palette: Red, Yellow (Gold), White
    const palette = [
        new THREE.Color('#FF0000'), 
        new THREE.Color('#FFD700'), 
        new THREE.Color('#FFFFFF'), 
    ];

    for (let i = 0; i < BULB_COUNT; i++) {
        const y = (Math.random() * TREE_HEIGHT) - (TREE_HEIGHT / 2);
        const rRatio = (TREE_HEIGHT / 2 - y) / TREE_HEIGHT;
        const radiusAtHeight = rRatio * TREE_RADIUS;
        
        const r = radiusAtHeight * (0.8 + Math.random() * 0.3);
        const theta = Math.random() * Math.PI * 2;
        
        const tx = r * Math.cos(theta);
        const ty = y;
        const tz = r * Math.sin(theta);

        pos[i * 3] = tx;
        pos[i * 3 + 1] = ty;
        pos[i * 3 + 2] = tz;

        // PUSH TO PERIPHERY: Increased radius to 22
        const [sx, sy, sz] = getLevitationPoint(22); 
        target[i * 3] = sx;
        target[i * 3 + 1] = sy;
        target[i * 3 + 2] = sz;

        const c = palette[Math.floor(Math.random() * palette.length)];
        cols[i * 3] = c.r;
        cols[i * 3 + 1] = c.g;
        cols[i * 3 + 2] = c.b;
    }
    return [pos, target, cols];
  }, []);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uTime = clock.getElapsedTime();
      materialRef.current.uProgress = THREE.MathUtils.lerp(materialRef.current.uProgress, progress, 0.05);
    }
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={BULB_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-targetPosition" count={BULB_COUNT} array={targetPositions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={BULB_COUNT} array={colors} itemSize={3} />
      </bufferGeometry>
      {/* @ts-ignore */}
      <coloredTwinkleMaterial 
        ref={materialRef} 
        transparent 
        depthWrite={false} 
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const PhotoSpiral = () => {
  const photos = useTreeStore(state => state.photos);
  const progress = useTreeStore(state => state.progress);
  
  // Create placeholders to ensure we have slots even without uploaded photos
  const displayPhotos = useMemo(() => {
    const arr = [...photos];
    // Limit to 14 photos for ring layout symmetry and to prevent overcrowding
    while (arr.length < 14) {
      arr.push(''); 
    }
    return arr.slice(0, 14); 
  }, [photos]);

  return (
    <group>
      {displayPhotos.map((url, i) => (
        <PhotoItem key={`${i}-${url || 'empty'}`} url={url} index={i} total={displayPhotos.length} progress={progress} />
      ))}
    </group>
  );
};

interface PhotoItemProps {
  url: string;
  index: number;
  total: number;
  progress: number;
}

const PhotoItem: React.FC<PhotoItemProps> = ({ url, index, total, progress }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { gl } = useThree();
  const [displayTexture, setDisplayTexture] = useState<THREE.Texture | null>(null);
  
  const activePhotoIndex = useTreeStore(state => state.activePhotoIndex);
  const setActivePhotoIndex = useTreeStore(state => state.setActivePhotoIndex);
  
  const isActive = activePhotoIndex === index;

  useEffect(() => {
    if (url) {
        const loader = new THREE.TextureLoader();
        loader.load(url, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = gl.capabilities.getMaxAnisotropy();
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = true;
            setDisplayTexture(tex);
        });
    } else {
        const canvas = createPlaceholderCanvas(index);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = gl.capabilities.getMaxAnisotropy();
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        setDisplayTexture(tex);
    }
  }, [url, index, gl]);

  // Calculate position ON the tree surface
  const { treePos, scatterPos, lookAtTarget } = useMemo(() => {
    // Distribute photos mainly in the middle-to-lower section
    const treeStartY = TREE_HEIGHT * 0.3; // slightly above middle
    const endY = -TREE_HEIGHT * 0.4; // near bottom
    const yRange = treeStartY - endY;
    
    // Distribute evenly vertically
    const ratio = index / Math.max(1, total - 1);
    const y = treeStartY - (ratio * yRange);
    
    // Calculate radius at this height (Cone formula)
    // Cone logic: Radius at top (y=TREE_HEIGHT/2) is 0, Radius at bottom (y=-TREE_HEIGHT/2) is TREE_RADIUS
    const distFromTop = (TREE_HEIGHT / 2) - y;
    const rCurrent = (distFromTop / TREE_HEIGHT) * TREE_RADIUS;
    
    // Attach to surface: slightly outside radius to avoid clipping branches
    const surfaceR = rCurrent + 0.5; 
    
    // Spiral angle around the tree
    const theta = index * (Math.PI * 2 / 3.5); // Roughly 3 photos per circle rotation
    
    const x = surfaceR * Math.cos(theta);
    const z = surfaceR * Math.sin(theta);
    
    const tp = new THREE.Vector3(x, y, z);
    
    // Look away from center (normal vector) so photo faces outward
    const lat = new THREE.Vector3(x * 2, y, z * 2);

    // --- SCATTER LOGIC: ELLIPTICAL RING LAYOUT ---
    // Distribute in a ring around the center
    // Ellipse dimensions to fit landscape screen
    const radiusX = 18.0; 
    const radiusY = 10.0; 
    
    // Calculate angle based on index
    // Start at Top (PI/2) for symmetry
    const angle = (index / Math.max(1, total)) * Math.PI * 2 + (Math.PI / 2);
    
    const sx = radiusX * Math.cos(angle);
    const sy = radiusY * Math.sin(angle);
    const sz = 8.0; // Bring forward to ensure they are the visual center and frame the tree

    const sp = new THREE.Vector3(sx, sy, sz);
    
    return { treePos: tp, scatterPos: sp, lookAtTarget: lat };
  }, [index, total]);

  useFrame((state) => {
    if (!groupRef.current) return;
    
    if (isActive) {
        // --- Active State Animation (Zoom In) ---
        // Calculate a position fixed in front of the camera (HUD-like)
        const dist = 5.0; // Distance in front of camera
        const targetWorldPos = new THREE.Vector3(0, 0, -dist);
        targetWorldPos.applyQuaternion(state.camera.quaternion);
        targetWorldPos.add(state.camera.position);

        // Convert world target to local target to account for parent rotation (SceneContent)
        if (groupRef.current.parent) {
            const targetLocalPos = groupRef.current.parent.worldToLocal(targetWorldPos.clone());
            groupRef.current.position.lerp(targetLocalPos, 0.1);
        } else {
             // Fallback if no parent (unlikely)
            groupRef.current.position.lerp(targetWorldPos, 0.1);
        }

        groupRef.current.lookAt(state.camera.position); // Always face the user
        
        // Scale up significantly to fill the view
        groupRef.current.scale.lerp(new THREE.Vector3(2.0, 2.0, 2.0), 0.1);
    } else {
        // --- Normal State Animation ---
        const currentPos = new THREE.Vector3().lerpVectors(treePos, scatterPos, progress);
        
        // Gentle float
        if (progress > 0.05) {
            currentPos.y += Math.sin(state.clock.elapsedTime + index) * 0.05 * progress;
        }
        
        groupRef.current.position.lerp(currentPos, 0.08);

        // Orientation
        if (progress < 0.6) {
            // Face outwards from tree surface
            groupRef.current.lookAt(lookAtTarget);
        } else {
            // Face camera when scattered
            groupRef.current.lookAt(state.camera.position);
        }

        // SCALING: 
        // Adjusted to ~3.3x to fit ring layout without overlapping while still being large
        const targetScale = 0.8 + (progress * 2.5); 
        groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.05);
    }
  });

  const handleClick = (e: any) => {
      e.stopPropagation();
      setActivePhotoIndex(isActive ? null : index);
  };

  return (
    <group ref={groupRef} onClick={handleClick} onPointerOver={() => document.body.style.cursor = 'pointer'} onPointerOut={() => document.body.style.cursor = 'auto'}>
        <mesh>
            {/* Box Backing - Landscape */}
            <boxGeometry args={[1.5, 1.2, 0.05]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} metalness={0.1} />
            
            {/* Front Photo - Landscape */}
            <mesh position={[0, 0, 0.026]}>
                 <planeGeometry args={[1.4, 1.1]} /> 
                 {displayTexture && (
                    <meshBasicMaterial map={displayTexture} toneMapped={false} />
                 )}
            </mesh>
            
            {/* Back Photo - Landscape */}
            <mesh position={[0, 0, -0.026]} rotation={[0, Math.PI, 0]}>
                 <planeGeometry args={[1.4, 1.1]} /> 
                 {displayTexture && (
                    <meshBasicMaterial map={displayTexture} toneMapped={false} />
                 )}
            </mesh>

            {/* Gold Frame Border - Landscape */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[1.6, 1.3, 0.04]} />
                <meshStandardMaterial color="#D4AF37" metalness={1} roughness={0.15} />
            </mesh>
        </mesh>
    </group>
  );
};

let placeholderCache: Record<number, HTMLCanvasElement> = {};
function createPlaceholderCanvas(index: number) {
    if (placeholderCache[index]) return placeholderCache[index];
    const canvas = document.createElement('canvas');
    // Landscape dimensions
    canvas.width = 640;
    canvas.height = 512; 
    const ctx = canvas.getContext('2d');
    if(ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0, 640, 512);
        ctx.fillStyle = '#1a1a1a';
        // Inner black rectangle for placeholder
        ctx.fillRect(40, 40, 560, 432);
        ctx.fillStyle = '#D4AF37';
        ctx.font = 'bold 50px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Centered text
        ctx.fillText(`PHOTO`, 320, 220);
        ctx.font = 'italic 40px serif';
        ctx.fillText(`#${index + 1}`, 320, 280);
    }
    placeholderCache[index] = canvas;
    return canvas;
}

// --- Decorations Systems ---

const GiftInstances = () => {
    const progress = useTreeStore(state => state.progress);
    const count = 80;
    
    const { positions, targets, colors } = useMemo(() => {
        const pArray = [];
        const tArray = [];
        const cArray = [];
        const palette = ['#D4AF37', '#8B0000', '#022D36']; // Gold, Red, Emerald

        for(let i=0; i<count; i++) {
             // Place closer to surface for "Hanging" effect
             const y = (Math.random() * TREE_HEIGHT) - (TREE_HEIGHT/2);
             const r = ((TREE_HEIGHT/2 - y) / TREE_HEIGHT) * TREE_RADIUS;
             const theta = Math.random() * Math.PI * 2;
             const x = (r * 0.9) * Math.cos(theta);
             const z = (r * 0.9) * Math.sin(theta);
             pArray.push(new THREE.Vector3(x, y, z));

             // PUSH TO PERIPHERY: Increased radius to 25
             const [sx, sy, sz] = getLevitationPoint(25); 
             tArray.push(new THREE.Vector3(sx, sy, sz));
             cArray.push(palette[Math.floor(Math.random() * palette.length)]);
        }
        return { positions: pArray, targets: tArray, colors: cArray };
    }, []);

    return (
        <Instances range={count}>
            {/* Standard geometry ensuring initialization logic for Instances works correctly */}
            <boxGeometry args={[0.6, 0.6, 0.6]} />
            <meshStandardMaterial roughness={0.2} metalness={0.6} />
            {positions.map((pos, i) => (
                <DecorationInstance key={i} startPos={pos} endPos={targets[i]} color={colors[i]} progress={progress} />
            ))}
        </Instances>
    )
}

const OrbInstances = () => {
    const progress = useTreeStore(state => state.progress);
    const count = 350; // Increased from 100 to 350 for fuller look
    
    const { positions, targets, colors } = useMemo(() => {
        const pArray = [];
        const tArray = [];
        const cArray = [];
        // Updated Palette: Gold & Red Only
        const palette = ['#D4AF37', '#FF0000']; 

        for(let i=0; i<count; i++) {
             const y = (Math.random() * TREE_HEIGHT) - (TREE_HEIGHT/2);
             const r = ((TREE_HEIGHT/2 - y) / TREE_HEIGHT) * TREE_RADIUS;
             const theta = Math.random() * Math.PI * 2;
             const x = (r * 0.85) * Math.cos(theta); // Slightly deeper than gifts
             const z = (r * 0.85) * Math.sin(theta);
             pArray.push(new THREE.Vector3(x, y, z));

             // PUSH TO PERIPHERY: Increased radius to 28
             const [sx, sy, sz] = getLevitationPoint(28); 
             tArray.push(new THREE.Vector3(sx, sy, sz));
             cArray.push(palette[Math.floor(Math.random() * palette.length)]);
        }
        return { positions: pArray, targets: tArray, colors: cArray };
    }, []);

    return (
        <Instances range={count}>
            <sphereGeometry args={[0.4, 32, 32]} />
            <meshStandardMaterial roughness={0.1} metalness={0.9} />
            {positions.map((pos, i) => (
                <DecorationInstance key={i} startPos={pos} endPos={targets[i]} color={colors[i]} progress={progress} />
            ))}
        </Instances>
    )
}

const DecorationInstance = ({ startPos, endPos, color, progress, scale = 1, flash = false, ...props }: any) => {
    const ref = useRef<any>(null);
    const [hoverOffset] = useState(() => Math.random() * 100);
    // Persist base color to allow flashing to reset
    const baseColor = useRef(new THREE.Color(color));

    useFrame((state) => {
        if (!ref.current) return;
        
        const currentPos = new THREE.Vector3().lerpVectors(startPos, endPos, progress);
        
        // Levitate
        if (progress > 0.1) {
            currentPos.y += Math.sin(state.clock.elapsedTime + hoverOffset) * 0.3 * progress;
        }

        ref.current.position.copy(currentPos);
        ref.current.scale.setScalar(scale);

        if (flash) {
            // Sparkling flash for white accents
            const t = state.clock.elapsedTime;
            const intensity = Math.sin(t * 15.0 + hoverOffset) > 0.5 ? 2.5 : 0.5;
            const c = baseColor.current.clone().multiplyScalar(intensity);
            ref.current.color.set(c);
        } else {
            ref.current.color.set(baseColor.current);
        }
    });

    return <Instance ref={ref} {...props} />;
}


// --- Cinematic Orbs (New: Filling gaps with high glow) ---
const CinematicOrbs = () => {
    const progress = useTreeStore(state => state.progress);
    const count = 450; // Increased from 150 to 450 to fill inner voids
    
    const { positions, targets, colors, scales, flashes } = useMemo(() => {
        const pArray = [];
        const tArray = [];
        const cArray = [];
        const sArray = [];
        const fArray = [];

        // Updated Palette: Red, Gold, and White
        const palette = ['#FF0000', '#FFD700', '#FFFFFF']; 

        for(let i=0; i<count; i++) {
             // Volume filling
             const y = (Math.random() * TREE_HEIGHT) - (TREE_HEIGHT/2);
             const rBase = ((TREE_HEIGHT/2 - y) / TREE_HEIGHT) * TREE_RADIUS;
             // Place somewhat deep to fill gaps, between 30% and 90% of radius
             const r = rBase * (0.3 + Math.random() * 0.6); 
             const theta = Math.random() * Math.PI * 2;
             
             const x = r * Math.cos(theta);
             const z = r * Math.sin(theta);
             pArray.push(new THREE.Vector3(x, y, z));

             // PUSH TO PERIPHERY: Increased radius to 30
             const [sx, sy, sz] = getLevitationPoint(30); 
             tArray.push(new THREE.Vector3(sx, sy, sz));
             
             const colorHex = palette[Math.floor(Math.random() * palette.length)];
             const isWhite = colorHex === '#FFFFFF';
             
             cArray.push(new THREE.Color(colorHex));
             fArray.push(isWhite);
             // Varied sizes for organic look - slightly smaller on average to act as filler
             sArray.push(0.25 + Math.random() * 0.4);
        }
        return { positions: pArray, targets: tArray, colors: cArray, scales: sArray, flashes: fArray };
    }, []);

    return (
        <Instances range={count}>
            <sphereGeometry args={[0.6, 32, 32]} />
            {/* Tone Mapped false + high emissive intensity triggers bloom */}
            <meshStandardMaterial 
                toneMapped={false} 
                emissiveIntensity={3.0} 
                roughness={0.2}
                metalness={0.8}
            />
            {positions.map((pos, i) => (
                <DecorationInstance 
                    key={i} 
                    startPos={pos} 
                    endPos={targets[i]} 
                    color={colors[i]} 
                    progress={progress} 
                    scale={scales[i]}
                    flash={flashes[i]}
                />
            ))}
        </Instances>
    )
}


// --- Light Orb Instances (Updated for Varied Sizes, Weights, Blink Types and Color Shift) ---

type BlinkType = 'steady' | 'pulse' | 'twinkle';

const LightInstance = ({ startPos, endPos, color, offset, progress, scaleFactor, weight, blinkType }: any) => {
    const ref = useRef<any>(null);
    // Create temp colors to avoid GC
    const tempColor = useRef(new THREE.Color());
    const targetColor = useRef(new THREE.Color());
    
    // Define Palettes
    // Warm Palette is passed in as `color` prop
    // Cool Palette (Blue/White winter vibe)
    const coolColor = useMemo(() => {
        const variants = ['#E0F7FA', '#B3E5FC', '#FFFFFF'];
        return new THREE.Color(variants[Math.floor(Math.random() * variants.length)]);
    }, []);

    useFrame((state) => {
        if (!ref.current) return;
        
        // --- 1. Position Logic ---
        const currentPos = new THREE.Vector3().lerpVectors(startPos, endPos, progress);
        
        if (progress > 0.1) {
            // Physics: Lighter floats more
            const floatAmplitude = (0.5 / weight) * 0.3; 
            currentPos.y += Math.sin(state.clock.elapsedTime + offset) * floatAmplitude * progress;
        }
        ref.current.position.copy(currentPos);

        // --- 2. Color Logic Removed (Replaced by Camera Control) ---
        // We keep the original warm color
        targetColor.current.copy(color);

        // --- 3. Blink/Brightness Logic ---
        const t = state.clock.elapsedTime;
        let brightness = 1.0;

        if (blinkType === 'steady') {
            // Subtle shimmer
            brightness = 0.9 + Math.sin(t * 1.5 + offset) * 0.1;
        } else if (blinkType === 'pulse') {
            // Slow breathing for large bulbs
            brightness = 0.5 + Math.sin(t * 2.0 + offset) * 0.5; // 0.0 to 1.0
            brightness = 0.4 + brightness * 0.8; // Map to 0.4 - 1.2
        } else if (blinkType === 'twinkle') {
            // Fast sharp blinking for fairy lights
            brightness = Math.sin(t * 8.0 + offset) > 0 ? 1.5 : 0.2;
        }
        
        // --- 4. Scale Logic ---
        const s = scaleFactor * (1.0 + Math.sin(t * 3.0 + offset) * 0.05);
        ref.current.scale.setScalar(s);

        // Apply
        ref.current.color.copy(targetColor.current).multiplyScalar(brightness);
    });

    return <Instance ref={ref} />;
};

const LightOrbInstances = () => {
    const progress = useTreeStore(state => state.progress);
    const count = 1000; // Increased from 600 to 1000 for a richer web of lights
    
    const { positions, targets, colors, offsets, scales, weights, blinkTypes } = useMemo(() => {
        const pArray = [];
        const tArray = [];
        const cArray = [];
        const oArray = [];
        const sArray = []; 
        const wArray = [];
        const bArray: BlinkType[] = [];

        // Luxury Warm Palette (Gold, Lemon Chiffon, White)
        const palette = ['#FFFACD', '#FFD700', '#FAFAD2', '#FFFFFF'];

        for(let i=0; i<count; i++) {
             const y = (Math.random() * TREE_HEIGHT) - (TREE_HEIGHT/2);
             const rBase = ((TREE_HEIGHT/2 - y) / TREE_HEIGHT) * TREE_RADIUS;
             const r = rBase * (0.85 + Math.random() * 0.25); 
             const theta = Math.random() * Math.PI * 2;
             const x = r * Math.cos(theta);
             const z = r * Math.sin(theta);
             pArray.push(new THREE.Vector3(x, y, z));

             // ATTRIBUTES
             // 20% Large Bulbs (Pulse), 60% Fairy Lights (Twinkle), 20% Steady
             const rand = Math.random();
             let scale = 1.0;
             let weight = 1.0;
             let bType: BlinkType = 'steady';

             if (rand > 0.8) {
                 // Large Bulb
                 scale = 2.5;
                 weight = 1.5 + Math.random() * 0.5;
                 bType = 'pulse';
             } else if (rand > 0.2) {
                 // Fairy Light
                 scale = 0.8;
                 weight = 0.5 + Math.random() * 0.5;
                 bType = 'twinkle';
             } else {
                 // Steady Light
                 scale = 1.2;
                 weight = 1.0;
                 bType = 'steady';
             }

             // PUSH TO PERIPHERY: Increased base scatter distance logic
             // Previous was 6.0, now 25.0 to frame the photos
             const scatterDistance = 25.0 * (1.0 / weight);
             const [sx, sy, sz] = getLevitationPoint(scatterDistance);
             tArray.push(new THREE.Vector3(sx, sy, sz));
             
             cArray.push(new THREE.Color(palette[Math.floor(Math.random() * palette.length)]));
             oArray.push(Math.random() * 100);
             sArray.push(scale);
             wArray.push(weight);
             bArray.push(bType);
        }
        return { positions: pArray, targets: tArray, colors: cArray, offsets: oArray, scales: sArray, weights: wArray, blinkTypes: bArray };
    }, []);

    return (
        <Instances range={count}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshBasicMaterial toneMapped={false} />
            {positions.map((pos, i) => (
                <LightInstance 
                    key={i} 
                    startPos={pos} 
                    endPos={targets[i]} 
                    color={colors[i]} 
                    offset={offsets[i]}
                    scaleFactor={scales[i]}
                    weight={weights[i]}
                    blinkType={blinkTypes[i]}
                    progress={progress} 
                />
            ))}
        </Instances>
    )
}

// --- Main Scene ---

const SceneContent = () => {
    const groupRef = useRef<THREE.Group>(null);
    const rotationVelocity = useTreeStore(state => state.rotationVelocity);
    const activePhotoIndex = useTreeStore(state => state.activePhotoIndex);
    const decorationsVisible = useTreeStore(state => state.decorationsVisible);
    
    useFrame((_, delta) => {
        if (groupRef.current) {
            // Stop rotation completely if a photo is active to allow reading/viewing
            const velocity = activePhotoIndex !== null ? 0 : (rotationVelocity || 0.05);
            groupRef.current.rotation.y += velocity * delta;
        }
    });

    return (
        <group ref={groupRef}>
            {/* The Central Golden Halo (Warm Atmosphere) */}
            <InnerGlow />
            
            {/* REMOVED Global atmospheric snowflake sparkles */}

            <SnowParticles />
            {/* New Glowing Aura Particles */}
            <GlowingParticles />

            <TreeStar />
            <Needles />
            {/* Lights always visible, but color shifts */}
            <LightOrbInstances />
            <PhotoSpiral />
            
            {/* Ornaments controlled by gesture toggle */}
            {decorationsVisible && (
                <>
                    <ColoredBulbs />
                    <GiftInstances />
                    <OrbInstances />
                    <CinematicOrbs />
                </>
            )}
            
            {/* Central Light to illuminate the core */}
            <pointLight position={[0, 0, 0]} intensity={2.0} color="#FFD700" distance={8} decay={1.5} />
        </group>
    );
};

// --- Camera Controller Logic ---
const CameraController = () => {
    const controlsRef = useRef<any>(null);
    const cameraVerticalTarget = useTreeStore(state => state.cameraVerticalTarget);

    useFrame(() => {
        if (controlsRef.current) {
            // RESTRICTED RANGE: 
            // Min: Math.PI / 3.5 (~50 deg) - prevents extreme top-down
            // Max: Math.PI / 2.0 (90 deg) - prevents bottom-up (looking from floor)
            const minAngle = Math.PI / 3.5;
            const maxAngle = Math.PI / 2.0;
            
            const targetAngle = minAngle + cameraVerticalTarget * (maxAngle - minAngle);
            
            // Smoothly interpolate current angle to target with heavier dampening (0.03)
            const currentAngle = controlsRef.current.getPolarAngle();
            const smoothedAngle = THREE.MathUtils.lerp(currentAngle, targetAngle, 0.03);
            
            // controlsRef.current.setPolarAngle(smoothedAngle); // Disabled dynamic control to lock view
        }
    });

    return <OrbitControls 
        ref={controlsRef} 
        enableZoom={false} 
        enablePan={false} 
        maxPolarAngle={Math.PI / 2.0} 
        minPolarAngle={Math.PI / 2.0} // Locked to horizontal
    />;
}

const TreeScene: React.FC = () => {
  return (
    <div className="w-full h-full relative">
        <Canvas shadows camera={{ position: [0, 2, 35], fov: 45 }} gl={{ antialias: true, toneMapping: THREE.ReinhardToneMapping, toneMappingExposure: 1.5 }}>
            <ambientLight intensity={0.3} color="#FFD700" />
            <spotLight position={[10, 20, 10]} angle={0.3} penumbra={1} intensity={2} color="#FFD700" castShadow />
            <pointLight position={[-10, 5, -10]} intensity={1} color="#4444ff" />
            
            <Environment preset="lobby" />
            
            <SceneContent />
            
            {/* Ambient Background Particles (Independent of scene rotation) */}
            <DustParticles />
            
            {/* High Intensity Bloom for Golden Halo */}
            <EffectComposer enableNormalPass={false}>
                <Bloom 
                    luminanceThreshold={0.8} 
                    mipmapBlur 
                    intensity={1.2} 
                    radius={0.6}
                    levels={9}
                />
            </EffectComposer>

            {/* Replaced standard OrbitControls with custom controller for gesture support */}
            <CameraController />
        </Canvas>
    </div>
  );
};

export default TreeScene;