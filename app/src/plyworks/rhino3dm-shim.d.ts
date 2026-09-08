declare module "rhino3dm/rhino3dm.module.js" {
  const rhino3dm: (options?: { locateFile?: (file: string) => string }) => Promise<any>;
  export default rhino3dm;
}
