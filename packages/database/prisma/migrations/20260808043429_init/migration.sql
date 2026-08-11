-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ORGANIZATION_ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "AccountModel" AS ENUM ('LEGACY', 'NEW_MODEL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('CONNECTED', 'ACTION_REQUIRED', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'INVALID');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION', 'SERVICE');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('DRAFT', 'QUEUED', 'SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION', 'SERVICE');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'CANCEL_REQUESTED', 'CANCELLED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PreflightResult" AS ENUM ('READY', 'WARNING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'PROCESSING', 'ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'meta',
    "encryptedToken" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "tokenType" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'meta',
    "metaBusinessId" TEXT,
    "credentialId" TEXT,
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "meta_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_businesses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "externalBusinessId" TEXT NOT NULL,
    "name" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "legacyWabaId" TEXT,
    "accountModel" "AccountModel" NOT NULL DEFAULT 'UNKNOWN',
    "name" TEXT,
    "currency" TEXT,
    "timezone" TEXT,
    "status" TEXT,
    "capabilities" JSONB,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "whatsappAccountId" TEXT NOT NULL,
    "externalPhoneAccountId" TEXT NOT NULL,
    "status" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "whatsappAccountId" TEXT NOT NULL,
    "externalMessagingAccountId" TEXT NOT NULL,
    "status" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_numbers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "whatsappAccountId" TEXT NOT NULL,
    "phoneAccountId" TEXT,
    "externalPhoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "verifiedName" TEXT,
    "qualityStatus" TEXT,
    "platformStatus" TEXT,
    "messagingLimitInfo" JSONB,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "components" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_deployments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "targetAccountId" TEXT NOT NULL,
    "messagingAccountId" TEXT,
    "externalTemplateId" TEXT,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'DRAFT',
    "errorCode" TEXT,
    "errorSubcode" TEXT,
    "errorMessage" TEXT,
    "fbtraceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "customFields" JSONB,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_consents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "source" TEXT,
    "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "evidence" JSONB,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_optouts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_optouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateDeploymentId" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "preflightResult" "PreflightResult",
    "preflightReport" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_targets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "whatsappAccountId" TEXT NOT NULL,
    "phoneNumberId" TEXT,
    "templateDeploymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "whatsappAccountId" TEXT,
    "phoneNumberId" TEXT,
    "templateDeploymentId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignRecipientId" TEXT,
    "contactId" TEXT,
    "phoneNumberId" TEXT,
    "externalMessageId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "fbtraceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "messageId" TEXT,
    "externalMessageId" TEXT,
    "status" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'meta',
    "eventType" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "status" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "rawPayload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "ip" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_alerts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "organization_users_userId_idx" ON "organization_users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_users_organizationId_userId_key" ON "organization_users"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "credentials_organizationId_idx" ON "credentials"("organizationId");

-- CreateIndex
CREATE INDEX "credentials_status_idx" ON "credentials"("status");

-- CreateIndex
CREATE INDEX "meta_connections_organizationId_idx" ON "meta_connections"("organizationId");

-- CreateIndex
CREATE INDEX "meta_connections_status_idx" ON "meta_connections"("status");

-- CreateIndex
CREATE INDEX "meta_businesses_organizationId_idx" ON "meta_businesses"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_businesses_metaConnectionId_externalBusinessId_key" ON "meta_businesses"("metaConnectionId", "externalBusinessId");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_organizationId_idx" ON "whatsapp_accounts"("organizationId");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_accountModel_idx" ON "whatsapp_accounts"("accountModel");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_metaConnectionId_externalAccountId_key" ON "whatsapp_accounts"("metaConnectionId", "externalAccountId");

-- CreateIndex
CREATE INDEX "phone_accounts_organizationId_idx" ON "phone_accounts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "phone_accounts_whatsappAccountId_externalPhoneAccountId_key" ON "phone_accounts"("whatsappAccountId", "externalPhoneAccountId");

-- CreateIndex
CREATE INDEX "messaging_accounts_organizationId_idx" ON "messaging_accounts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_accounts_whatsappAccountId_externalMessagingAccou_key" ON "messaging_accounts"("whatsappAccountId", "externalMessagingAccountId");

-- CreateIndex
CREATE INDEX "phone_numbers_organizationId_idx" ON "phone_numbers"("organizationId");

-- CreateIndex
CREATE INDEX "phone_numbers_isPaused_idx" ON "phone_numbers"("isPaused");

-- CreateIndex
CREATE UNIQUE INDEX "phone_numbers_whatsappAccountId_externalPhoneNumberId_key" ON "phone_numbers"("whatsappAccountId", "externalPhoneNumberId");

-- CreateIndex
CREATE INDEX "templates_organizationId_idx" ON "templates"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "templates_organizationId_name_language_key" ON "templates"("organizationId", "name", "language");

-- CreateIndex
CREATE UNIQUE INDEX "template_deployments_idempotencyKey_key" ON "template_deployments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "template_deployments_organizationId_idx" ON "template_deployments"("organizationId");

-- CreateIndex
CREATE INDEX "template_deployments_status_idx" ON "template_deployments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "template_deployments_templateId_targetAccountId_key" ON "template_deployments"("templateId", "targetAccountId");

-- CreateIndex
CREATE INDEX "contacts_organizationId_idx" ON "contacts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_organizationId_phone_key" ON "contacts"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "contact_consents_organizationId_idx" ON "contact_consents"("organizationId");

-- CreateIndex
CREATE INDEX "contact_consents_contactId_consentType_idx" ON "contact_consents"("contactId", "consentType");

-- CreateIndex
CREATE INDEX "contact_optouts_organizationId_idx" ON "contact_optouts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_optouts_organizationId_contactId_key" ON "contact_optouts"("organizationId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_idempotencyKey_key" ON "campaigns"("idempotencyKey");

-- CreateIndex
CREATE INDEX "campaigns_organizationId_idx" ON "campaigns"("organizationId");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaign_targets_organizationId_idx" ON "campaign_targets"("organizationId");

-- CreateIndex
CREATE INDEX "campaign_targets_campaignId_idx" ON "campaign_targets"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_recipients_organizationId_idx" ON "campaign_recipients"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaignId_dedupeKey_key" ON "campaign_recipients"("campaignId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "messages_idempotencyKey_key" ON "messages"("idempotencyKey");

-- CreateIndex
CREATE INDEX "messages_organizationId_idx" ON "messages"("organizationId");

-- CreateIndex
CREATE INDEX "messages_status_idx" ON "messages"("status");

-- CreateIndex
CREATE INDEX "messages_externalMessageId_idx" ON "messages"("externalMessageId");

-- CreateIndex
CREATE INDEX "message_events_organizationId_idx" ON "message_events"("organizationId");

-- CreateIndex
CREATE INDEX "message_events_externalMessageId_idx" ON "message_events"("externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_dedupeKey_key" ON "webhook_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "webhook_events_status_idx" ON "webhook_events"("status");

-- CreateIndex
CREATE INDEX "webhook_events_eventType_idx" ON "webhook_events"("eventType");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "system_alerts_organizationId_idx" ON "system_alerts"("organizationId");

-- CreateIndex
CREATE INDEX "system_alerts_status_idx" ON "system_alerts"("status");

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_businesses" ADD CONSTRAINT "meta_businesses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_businesses" ADD CONSTRAINT "meta_businesses_metaConnectionId_fkey" FOREIGN KEY ("metaConnectionId") REFERENCES "meta_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_metaConnectionId_fkey" FOREIGN KEY ("metaConnectionId") REFERENCES "meta_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_accounts" ADD CONSTRAINT "phone_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_accounts" ADD CONSTRAINT "phone_accounts_whatsappAccountId_fkey" FOREIGN KEY ("whatsappAccountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_accounts" ADD CONSTRAINT "messaging_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_accounts" ADD CONSTRAINT "messaging_accounts_whatsappAccountId_fkey" FOREIGN KEY ("whatsappAccountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_whatsappAccountId_fkey" FOREIGN KEY ("whatsappAccountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_phoneAccountId_fkey" FOREIGN KEY ("phoneAccountId") REFERENCES "phone_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_deployments" ADD CONSTRAINT "template_deployments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_deployments" ADD CONSTRAINT "template_deployments_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_deployments" ADD CONSTRAINT "template_deployments_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_deployments" ADD CONSTRAINT "template_deployments_messagingAccountId_fkey" FOREIGN KEY ("messagingAccountId") REFERENCES "messaging_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_consents" ADD CONSTRAINT "contact_consents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_consents" ADD CONSTRAINT "contact_consents_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_optouts" ADD CONSTRAINT "contact_optouts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_optouts" ADD CONSTRAINT "contact_optouts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_templateDeploymentId_fkey" FOREIGN KEY ("templateDeploymentId") REFERENCES "template_deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_targets" ADD CONSTRAINT "campaign_targets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_targets" ADD CONSTRAINT "campaign_targets_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "phone_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_templateDeploymentId_fkey" FOREIGN KEY ("templateDeploymentId") REFERENCES "template_deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_campaignRecipientId_fkey" FOREIGN KEY ("campaignRecipientId") REFERENCES "campaign_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "phone_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
