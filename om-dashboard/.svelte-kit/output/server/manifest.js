export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["robots.txt"]),
	mimeTypes: {".txt":"text/plain"},
	_: {
		client: {start:"_app/immutable/entry/start.Hg_fLtTL.js",app:"_app/immutable/entry/app.BcmpbZ8p.js",imports:["_app/immutable/entry/start.Hg_fLtTL.js","_app/immutable/chunks/DGEc00YI.js","_app/immutable/chunks/B3NP0vlR.js","_app/immutable/chunks/DWTrzQ7S.js","_app/immutable/entry/app.BcmpbZ8p.js","_app/immutable/chunks/B3NP0vlR.js","_app/immutable/chunks/BBsY2ese.js","_app/immutable/chunks/JhNu93na.js","_app/immutable/chunks/DWTrzQ7S.js","_app/immutable/chunks/DPmK0vIw.js","_app/immutable/chunks/BetapMU0.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
