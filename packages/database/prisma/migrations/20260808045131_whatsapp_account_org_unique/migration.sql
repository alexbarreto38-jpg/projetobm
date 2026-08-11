-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_organizationId_externalAccountId_key" ON "whatsapp_accounts"("organizationId", "externalAccountId");

