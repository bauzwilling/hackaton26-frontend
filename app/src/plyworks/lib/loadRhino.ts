import rhino3dm from "rhino3dm/rhino3dm.module.js";
import rhino3dmWasm from "rhino3dm/rhino3dm.wasm?url";

type RhinoModule = Awaited<ReturnType<typeof rhino3dm>>;

let rhino: RhinoModule | null = null;
let loadPromise: Promise<RhinoModule> | null = null;

export async function loadRhino(): Promise<RhinoModule> {
  if (rhino) return rhino;
  if (loadPromise) return loadPromise;
  loadPromise = rhino3dm({ locateFile: () => rhino3dmWasm }).then((module) => {
    rhino = module;
    return module;
  });
  return loadPromise;
}
