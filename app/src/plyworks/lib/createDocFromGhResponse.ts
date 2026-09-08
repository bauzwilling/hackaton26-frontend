import type { GeometryPayload } from "./produceApi";
import { loadRhino } from "./loadRhino";

function parseGhPathIndices(path: string): number[] {
  const inner = path.replace(/^\{|\}$/g, "");
  if (!inner) return [];
  return inner.split(";").map((part) => Number.parseInt(part, 10));
}

function compareGhPaths(a: string, b: string): number {
  const pa = parseGhPathIndices(a);
  const pb = parseGhPathIndices(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

function sortedBranchPaths(innerTree: Record<string, unknown>): string[] {
  return Object.keys(innerTree).sort(compareGhPaths);
}

function parseLeafData(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function createDocFromGhResponse(res: GeometryPayload | null | undefined) {
  const rhino = await loadRhino();
  const doc = new rhino.File3dm();
  let geometryCount = 0;

  for (const output of res?.values ?? []) {
    const innerTree = output.InnerTree ?? {};
    let branchIndex = 0;
    for (const path of sortedBranchPaths(innerTree)) {
      for (const leaf of innerTree[path] ?? []) {
        if (!String(leaf.type ?? "").includes("Geometry")) continue;
        const data = parseLeafData(leaf.data);
        const rhinoObject = rhino.CommonObject.decode(data);
        if (!rhinoObject) continue;
        const attrs = new rhino.ObjectAttributes();
        attrs.setUserString("ghParamName", output.ParamName ?? "");
        attrs.setUserString("ghBranchIndex", String(branchIndex));
        doc.objects().add(rhinoObject, attrs);
        geometryCount += 1;
      }
      branchIndex += 1;
    }
  }

  const objects = doc.objects();
  for (let i = 0; i < objects.count; i++) {
    const rhinoObject = objects.get(i);
    const geometry = rhinoObject.geometry();
    if (geometry.userStringCount > 0) {
      const userStrings = geometry.getUserStrings();
      for (let j = 0; j < userStrings.length; j++) {
        rhinoObject.attributes().setUserString(userStrings[j][0], userStrings[j][1]);
      }
    }
  }

  return { doc, geometryCount };
}
