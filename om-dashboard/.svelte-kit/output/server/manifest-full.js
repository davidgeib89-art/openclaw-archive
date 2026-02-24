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
		client: {start:"_app/immutable/entry/start.CsXw60uY.js",app:"_app/immutable/entry/app.BCIaWOOz.js",imports:["_app/immutable/entry/start.CsXw60uY.js","_app/immutable/chunks/YGVZWT2e.js","_app/immutable/chunks/cqGcPMfL.js","_app/immutable/chunks/BEab5qyO.js","_app/immutable/entry/app.BCIaWOOz.js","_app/immutable/chunks/cqGcPMfL.js","_app/immutable/chunks/xd0Io72X.js","_app/immutable/chunks/D9G2-BG7.js","_app/immutable/chunks/BEab5qyO.js","_app/immutable/chunks/DKhV3c3U.js","_app/immutable/chunks/DAlGkYGl.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
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
