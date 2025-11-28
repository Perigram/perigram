import { TRACKING_COOKIE_NAME } from '~~/server/tracking/const'
import { getCookie } from 'h3'
import { createOrUpdateUser } from '~~/server/utils/user'
import { setSessionCookie } from '~~/server/utils/user'

export default defineEventHandler(async (event) => {
    const { githubCode } = await readBody(event)

    // Exchange code for access token
    const tokenResponse = await $fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: useRuntimeConfig().public.githubClientId,
            client_secret: useRuntimeConfig().githubClientSecret,
            code: githubCode,
        })
    })

    const accessToken = tokenResponse.access_token

    if (!accessToken) {
        setResponseStatus(event, 401)
        return {
            error: 'Failed to get access token'
        }
    }

    // Get user info
    const userData = await $fetch('https://api.github.com/user', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
        }
    })

    const { id, avatar_url, email, name, login } = userData

    if (!id) {
        setResponseStatus(event, 401)
        return {
            error: 'Invalid user data'
        }
    }

    const sessionId = getCookie(event, TRACKING_COOKIE_NAME)

    const session = await createOrUpdateUser({
        sessionId: sessionId,
        providerId: `github:${id}`,
        email: email || `${login}@github.local`,
        name: name || login,
        avatarUrl: avatar_url
    })

    setSessionCookie(event, session)
    return
})
