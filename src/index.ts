import fs from "fs/promises";
import path from "path";
import _ from "lodash";
import { BuildOptions, Plugin } from "esbuild";
import { IPackageJson } from "package-json-type";
import { program } from "commander";

export const avoidDevPeerConflicts = ({
  pkg,
}: {
  pkg: IPackageJson;
}): Plugin => ({
  name: "avoid-dev-peer-conflicts",
  async setup(build) {
    let base_dir = process.cwd();
    let all_deps = Object.keys(pkg.dependencies || {}).concat(
      Object.keys(pkg.devDependencies || {})
    );
    let peer_deps = all_deps.map((k) => {
      let dep_pkg = require(`${base_dir}/node_modules/${k}/package.json`);
      if (!dep_pkg.peerDependencies) {
        return [];
      }

      return Object.keys(dep_pkg.peerDependencies);
    });

    let peer_deps_flat = _.uniq(_.flatten(peer_deps));
    peer_deps_flat.forEach((k) => {
      let dep_pkg = require(`${base_dir}/node_modules/${k}/package.json`);
      let filter = new RegExp(`^${k}$`);
      build.onResolve({ filter }, (args) => ({
        path: `${base_dir}/node_modules/${args.path}/${dep_pkg.main}`,
      }));
    });
  },
});

export const copyPlugin = ({
  extensions,
}: {
  extensions: string[];
}): Plugin => ({
  name: "copy",
  setup(build) {
    let outdir = build.initialOptions.outdir;
    if (!outdir) {
      throw `outdir must be specified`;
    }

    let paths: [string, string][] = [];
    let filter = new RegExp(extensions.map(_.escapeRegExp).join("|"));
    build.onResolve({ filter }, (args) => {
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

export const cli = (): BuildOptions => {
  program.option("-w, --watch");
  program.option("-p, --prod");
  program.parse(process.argv);
  const options = program.opts();

  return {
    watch: options.watch,
    minify: options.prod,
  };
};
