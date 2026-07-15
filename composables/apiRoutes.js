export const API_ROUTES = {
    PROJECTS: '/api/project/me',
    LOGOUT: '/api/auth/logout',
    USER: '/api/user',
    RESULTS: (slug) => slug ? `/api/project/${slug}/results` : '/api/results',
    DXFFILE: (slug) => `/api/queue/${slug}/dxf`,
    AUTH: (slug) => `/api/auth/${slug}/redirect`,
    PROJECT: (slug) => slug ? `/api/project/${slug}` : '/api/project',
    ADDFILES: (slug) => `/api/project/${slug}/addfiles`,
    LOGIN: (slug) => `/api/auth/${slug}/login`,
};
