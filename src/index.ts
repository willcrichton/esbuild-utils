import fs from "fs/promises";
import path from "path";
import _ from "lodash";
import { Plugin } from "esbuild";
import { IPackageJson } from "package-json-type";

export const avoidSymlinkConflictsPlugin = (pkg: IPackageJson): Plugin => ({
  name: "test",
  async setup(build) {
    let deps = await Promise.all(
      Object.keys(pkg.dependencies || []).map(async (k) => {
        let stats = await fs.lstat(`./node_modules/${k}`);
        if (!stats.isSymbolicLink()) {
          return [];
        }

        let dep_pkg = require(`./node_modules/${k}/package.json`);
        if (!dep_pkg.peerDependencies) {
          return [];
        }

        return Object.keys(dep_pkg.peerDependencies);
      })
    );

    let deps_flat = _.uniq(_.flatten(deps));

    deps_flat.forEach((k) => {
      let dep_pkg = require(`./node_modules/${k}/package.json`);
      let filter = new RegExp(`^${k}$`);
      build.onResolve({ filter }, (args) => ({
        path: `${path.resolve(__dirname)}/node_modules/${args.path}/${
          dep_pkg.main
        }`,
      }));
    });
  },
});

export const copyPlugin = (): Plugin => ({
  name: "copy",
  setup(build) {
    let outdir = build.initialOptions.outdir;
    if (!outdir) {
      throw `outdir must be specified`;
    }

    let paths: [string, string][] = [];
    build.onResolve({ filter: /\.html$/ }, (args) => {
      let abs_path = path.join(args.resolveDir, args.path);
      let outpath = path.join(outdir!, path.basename(args.path));
      paths.push([abs_path, outpath]);
      return { path: args.path, namespace: "copy", watchFiles: [abs_path] };
    });

    build.onLoad({ filter: /.*/, namespace: "copy" }, async (args) => {
      return {
        contents: "",
      };
    });

    build.onEnd((_) => {
      paths.forEach(([inpath, outpath]) => fs.copyFile(inpath, outpath));
    });
  },
});
