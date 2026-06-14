import * as THREE from "three";

export const SURFACE_TEXTURE_URLS = {
  rock01: "/tex/rock01.jpg",
  rock02: "/tex/rock02.jpg",
  ice01: "/tex/ice01.jpg",
  mars01: "/tex/mars01.jpg",
  moon01: "/tex/moon01.jpg"
};

const SHARED_SURFACE_TEXTURE_CACHE = new Map();
const SHARED_TEXTURE_LOADER = new THREE.TextureLoader();

export function preloadSurfaceTextures(renderer) {
  const preloadPromises = Object.keys(SURFACE_TEXTURE_URLS).map((textureId) =>
    preloadSurfaceTexture(textureId, renderer)
  );

  return Promise.all(preloadPromises);
}

export function getSurfaceTexture(textureId) {
  return SHARED_SURFACE_TEXTURE_CACHE.get(textureId) ?? null;
}

export function preloadSurfaceTexture(textureId, renderer) {
  if (!textureId || textureId === "none") {
    return Promise.resolve(null);
  }

  const cachedTexture = SHARED_SURFACE_TEXTURE_CACHE.get(textureId);

  if (cachedTexture) {
    return cachedTexture.userData.ready
      ? Promise.resolve(cachedTexture)
      : cachedTexture.userData.promise;
  }

  const url = SURFACE_TEXTURE_URLS[textureId];

  if (!url) {
    return Promise.resolve(null);
  }

  let resolveTexture;
  let rejectTexture;

  const promise = new Promise((resolve, reject) => {
    resolveTexture = resolve;
    rejectTexture = reject;
  });

  const texture = SHARED_TEXTURE_LOADER.load(
    url,
    (loadedTexture) => {
      loadedTexture.userData.ready = true;

      if (renderer?.initTexture) {
        renderer.initTexture(loadedTexture);
      }

      resolveTexture(loadedTexture);
    },
    undefined,
    (error) => {
      texture.userData.ready = false;
      rejectTexture(error);
    }
  );

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.userData.ready = false;
  texture.userData.promise = promise;

  if (renderer?.capabilities?.getMaxAnisotropy) {
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  }

  SHARED_SURFACE_TEXTURE_CACHE.set(textureId, texture);

  return promise;
}
