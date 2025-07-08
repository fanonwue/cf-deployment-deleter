import 'dotenv/config'
import Cloudflare from "cloudflare";
import {APIPromise, PagePromise} from "cloudflare/core";
import {Deployment, DeploymentsSinglePage, DeploymentDeleteResponse} from "cloudflare/resources/pages/projects";
import {parseIntOrDefault, toLoggingSafeConfig, verifyConfig} from "./utils";
import {AppConfig, Environment, FetchDeploymentOptions, StageStatus} from "./types";

const defaultEnv: Environment = "production"
const alwaysRemoveStatuses = new Set<StageStatus>(["failure", "canceled"])
const neverRemoveStatuses = new Set<StageStatus>(["active"])

const appConfig: AppConfig = {
    apiToken: process.env.CF_API_TOKEN ?? "",
    accountId: process.env.CF_ACCOUNT_ID ?? "",
    projectName: process.env.CF_PROJECT_NAME ?? "",
    expirationHours: parseIntOrDefault(process.env.CF_EXPIRATION_HOURS, 6),
    environment: (process.env.CF_ENV as Environment|undefined) ?? defaultEnv
}

if (!verifyConfig(appConfig)) {
    console.error("Invalid configuration. Exiting.")
    process.exit(1)
}

console.log("Using configuration:", toLoggingSafeConfig(appConfig))

const client = new Cloudflare({
    apiToken: appConfig.apiToken,
})

function fetchDeployments(options: FetchDeploymentOptions = {}): PagePromise<DeploymentsSinglePage, Deployment> {
    return client.pages.projects.deployments.list(appConfig.projectName, {
        account_id: appConfig.accountId,
        env: options.env ?? defaultEnv,
    })
}

function deleteDeployment(deploymentId: string|Deployment): APIPromise<DeploymentDeleteResponse|null> {
    if (typeof deploymentId !== "string") deploymentId = deploymentId.id
    return client.pages.projects.deployments.delete(appConfig.projectName, deploymentId, {
        account_id: appConfig.accountId,
    });
}

async function forEachDeployment(callback: (page: Deployment) => void, options: FetchDeploymentOptions = {}) {
    for await (const deployment of fetchDeployments(options)) {
        callback(deployment)
    }
}

async function fetchDeploymentsAsArray(options: FetchDeploymentOptions = {}): Promise<Array<Deployment>> {
    const deployments: Array<Deployment> = []
    await forEachDeployment(deployment => deployments.push(deployment), options)
    return deployments
}

async function run() {

    const options: FetchDeploymentOptions = {
        env: "production"
    }
    const deployments: Array<Deployment> = await fetchDeploymentsAsArray(options)

    console.log(`Existing deployments in environment ${options.env}:`, deployments.length)

    const latestDeployment = deployments
        .filter(deployment => isDeploymentSuccessful(deployment) )
        .sort((a, b) => {
            const dateA = new Date(a.created_on)
            const dateB = new Date(b.created_on)
            return dateB.getTime() - dateA.getTime()
        })[0]

    if (latestDeployment) {
        console.log(`Latest successful deployment: ${latestDeployment.id} (created on ${latestDeployment.created_on})`)
    } else {
        console.error("No successful deployments found. Aborting.")
        return
    }

    const deploymentsToDelete = deployments.filter(deployment => {
        if (deployment.id == latestDeployment?.id) return false
        if (neverRemoveStatuses.has(deployment.latest_stage.status)) return false
        if (alwaysRemoveStatuses.has(deployment.latest_stage.status)) return true
        if ((Date.now() - new Date(deployment.created_on).getTime()) / (1000 * 60 * 60) <= appConfig.expirationHours) return false
        return true
    })

    console.log("Deployments to delete:", deploymentsToDelete.length)

    for (const deployment of deploymentsToDelete) {
        try {
            console.log(`Deleting deployment '${deployment.id}'...`)
            await deleteDeployment(deployment)
            console.log(`Deployment '${deployment.id}' deleted.`)
        } catch (e) {
            console.error(`Error deleting deployment '${deployment.id}':`, e)
        }
    }
}

function isDeploymentSuccessful(deployment: Deployment): boolean {
    return deployment.latest_stage.status === "success"
}


run().then(() => console.log("Done."))