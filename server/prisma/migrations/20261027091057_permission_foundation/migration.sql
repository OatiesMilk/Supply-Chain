-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('SCREEN', 'RESOURCE', 'CATEGORY');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('READ', 'WRITE', 'CREATE', 'UPDATE', 'ASSIGN', 'STATUS', 'TIME_IN', 'POD', 'COMMENT', 'SUBMIT', 'RECEIVE', 'COMPLETE', 'VERIFY_COLLECTION', 'DELETE', 'ADJUST');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authorizationRevision" BIGINT NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "PermissionDefinition" (
    "key" TEXT NOT NULL,
    "scope" "PermissionScope" NOT NULL,
    "module" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,

    CONSTRAINT "PermissionDefinition_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RolePolicy" (
    "role" TEXT NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 1,
    "catalogVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePolicy_pkey" PRIMARY KEY ("role")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "role" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role","permissionKey")
);

-- CreateTable
CREATE TABLE "UserPermissionOverride" (
    "userId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceLegacyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("userId","permissionKey")
);

-- CreateTable
CREATE TABLE "PermissionConversion" (
    "userId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "catalogVersion" INTEGER NOT NULL DEFAULT 1,
    "report" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionConversion_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PermissionQuarantine" (
    "legacyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionQuarantine_pkey" PRIMARY KEY ("legacyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PermissionDefinition_scope_module_action_key" ON "PermissionDefinition"("scope", "module", "action");

-- CreateIndex
CREATE INDEX "PermissionQuarantine_userId_idx" ON "PermissionQuarantine"("userId");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_role_fkey" FOREIGN KEY ("role") REFERENCES "RolePolicy"("role") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "PermissionDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "PermissionDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionConversion" ADD CONSTRAINT "PermissionConversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- V1 catalog validation; unknown keys/effects fail even outside Prisma.
ALTER TABLE "PermissionDefinition" ADD CONSTRAINT "PermissionDefinition_known_key" CHECK ("key" IN (
    'SCREEN:main:READ',
    'SCREEN:main:WRITE',
    'SCREEN:dashboard:READ',
    'SCREEN:dashboard:WRITE',
    'SCREEN:deliveries:READ',
    'SCREEN:deliveries:WRITE',
    'SCREEN:rma:READ',
    'SCREEN:rma:WRITE',
    'SCREEN:accounting_collection:READ',
    'SCREEN:accounting_collection:WRITE',
    'SCREEN:procurement_pickup:READ',
    'SCREEN:procurement_pickup:WRITE',
    'SCREEN:sales_orders:READ',
    'SCREEN:sales_orders:WRITE',
    'SCREEN:customers:READ',
    'SCREEN:customers:WRITE',
    'SCREEN:suppliers:READ',
    'SCREEN:suppliers:WRITE',
    'SCREEN:driver:READ',
    'SCREEN:driver:WRITE',
    'SCREEN:driver_manager:READ',
    'SCREEN:driver_manager:WRITE',
    'SCREEN:calendar:READ',
    'SCREEN:calendar:WRITE',
    'SCREEN:driver_board:READ',
    'SCREEN:driver_board:WRITE',
    'SCREEN:am_directory:READ',
    'SCREEN:am_directory:WRITE',
    'SCREEN:transactions:READ',
    'SCREEN:transactions:WRITE',
    'SCREEN:inventory:READ',
    'SCREEN:inventory:WRITE',
    'SCREEN:statistical_reports:READ',
    'SCREEN:statistical_reports:WRITE',
    'SCREEN:driver_dashboard:READ',
    'SCREEN:driver_dashboard:WRITE',
    'SCREEN:data_sampler:READ',
    'SCREEN:data_sampler:WRITE',
    'SCREEN:admin:READ',
    'SCREEN:admin:WRITE',
    'RESOURCE:records:READ',
    'RESOURCE:companies:READ',
    'RESOURCE:companies:WRITE',
    'RESOURCE:companies:CREATE',
    'RESOURCE:customers:READ',
    'RESOURCE:customers:WRITE',
    'RESOURCE:customers:CREATE',
    'RESOURCE:customers:UPDATE',
    'RESOURCE:suppliers:READ',
    'RESOURCE:suppliers:WRITE',
    'RESOURCE:suppliers:CREATE',
    'RESOURCE:drivers:READ',
    'RESOURCE:drivers:WRITE',
    'RESOURCE:drivers:CREATE',
    'RESOURCE:drivers:UPDATE',
    'RESOURCE:drivers:DELETE',
    'RESOURCE:skus:READ',
    'RESOURCE:skus:WRITE',
    'RESOURCE:skus:CREATE',
    'RESOURCE:skus:UPDATE',
    'RESOURCE:skus:ADJUST',
    'RESOURCE:dashboard:READ',
    'RESOURCE:transactions:READ',
    'RESOURCE:users:READ',
    'RESOURCE:users:WRITE',
    'RESOURCE:users:CREATE',
    'RESOURCE:users:UPDATE',
    'RESOURCE:users:DELETE',
    'RESOURCE:admin:READ',
    'RESOURCE:admin:WRITE',
    'RESOURCE:dataSampler:READ',
    'RESOURCE:dataSampler:WRITE',
    'CATEGORY:DELIVERY:READ',
    'CATEGORY:DELIVERY:WRITE',
    'CATEGORY:DELIVERY:CREATE',
    'CATEGORY:DELIVERY:UPDATE',
    'CATEGORY:DELIVERY:ASSIGN',
    'CATEGORY:DELIVERY:STATUS',
    'CATEGORY:DELIVERY:TIME_IN',
    'CATEGORY:DELIVERY:POD',
    'CATEGORY:DELIVERY:COMMENT',
    'CATEGORY:DELIVERY:SUBMIT',
    'CATEGORY:DELIVERY:RECEIVE',
    'CATEGORY:DELIVERY:COMPLETE',
    'CATEGORY:DELIVERY:VERIFY_COLLECTION',
    'CATEGORY:DELIVERY:DELETE',
    'CATEGORY:RMA:READ',
    'CATEGORY:RMA:WRITE',
    'CATEGORY:RMA:CREATE',
    'CATEGORY:RMA:UPDATE',
    'CATEGORY:RMA:ASSIGN',
    'CATEGORY:RMA:STATUS',
    'CATEGORY:RMA:TIME_IN',
    'CATEGORY:RMA:POD',
    'CATEGORY:RMA:COMMENT',
    'CATEGORY:RMA:SUBMIT',
    'CATEGORY:RMA:RECEIVE',
    'CATEGORY:RMA:COMPLETE',
    'CATEGORY:RMA:VERIFY_COLLECTION',
    'CATEGORY:RMA:DELETE',
    'CATEGORY:ACCOUNTING_COLLECTION:READ',
    'CATEGORY:ACCOUNTING_COLLECTION:WRITE',
    'CATEGORY:ACCOUNTING_COLLECTION:CREATE',
    'CATEGORY:ACCOUNTING_COLLECTION:UPDATE',
    'CATEGORY:ACCOUNTING_COLLECTION:ASSIGN',
    'CATEGORY:ACCOUNTING_COLLECTION:STATUS',
    'CATEGORY:ACCOUNTING_COLLECTION:TIME_IN',
    'CATEGORY:ACCOUNTING_COLLECTION:POD',
    'CATEGORY:ACCOUNTING_COLLECTION:COMMENT',
    'CATEGORY:ACCOUNTING_COLLECTION:SUBMIT',
    'CATEGORY:ACCOUNTING_COLLECTION:RECEIVE',
    'CATEGORY:ACCOUNTING_COLLECTION:COMPLETE',
    'CATEGORY:ACCOUNTING_COLLECTION:VERIFY_COLLECTION',
    'CATEGORY:ACCOUNTING_COLLECTION:DELETE',
    'CATEGORY:PROCUREMENT_PICKUP:READ',
    'CATEGORY:PROCUREMENT_PICKUP:WRITE',
    'CATEGORY:PROCUREMENT_PICKUP:CREATE',
    'CATEGORY:PROCUREMENT_PICKUP:UPDATE',
    'CATEGORY:PROCUREMENT_PICKUP:ASSIGN',
    'CATEGORY:PROCUREMENT_PICKUP:STATUS',
    'CATEGORY:PROCUREMENT_PICKUP:TIME_IN',
    'CATEGORY:PROCUREMENT_PICKUP:POD',
    'CATEGORY:PROCUREMENT_PICKUP:COMMENT',
    'CATEGORY:PROCUREMENT_PICKUP:SUBMIT',
    'CATEGORY:PROCUREMENT_PICKUP:RECEIVE',
    'CATEGORY:PROCUREMENT_PICKUP:COMPLETE',
    'CATEGORY:PROCUREMENT_PICKUP:VERIFY_COLLECTION',
    'CATEGORY:PROCUREMENT_PICKUP:DELETE',
    'CATEGORY:SALES_ORDERS:READ',
    'CATEGORY:SALES_ORDERS:WRITE',
    'CATEGORY:SALES_ORDERS:CREATE',
    'CATEGORY:SALES_ORDERS:UPDATE',
    'CATEGORY:SALES_ORDERS:ASSIGN',
    'CATEGORY:SALES_ORDERS:STATUS',
    'CATEGORY:SALES_ORDERS:TIME_IN',
    'CATEGORY:SALES_ORDERS:POD',
    'CATEGORY:SALES_ORDERS:COMMENT',
    'CATEGORY:SALES_ORDERS:SUBMIT',
    'CATEGORY:SALES_ORDERS:RECEIVE',
    'CATEGORY:SALES_ORDERS:COMPLETE',
    'CATEGORY:SALES_ORDERS:VERIFY_COLLECTION',
    'CATEGORY:SALES_ORDERS:DELETE'
));
ALTER TABLE "PermissionDefinition" ADD CONSTRAINT "PermissionDefinition_key_parts" CHECK ("key" = "scope"::text || ':' || "module" || ':' || "action"::text);
ALTER TABLE "RolePolicy" ADD CONSTRAINT "RolePolicy_builtin_role" CHECK ("role" IN ('SALES_COORDINATOR','LOGISTICS','TASS','ADMIN','DRIVER'));
ALTER TABLE "RolePolicy" ADD CONSTRAINT "RolePolicy_positive_revision" CHECK ("revision" >= 1);
ALTER TABLE "RolePolicy" ADD CONSTRAINT "RolePolicy_catalog_v1" CHECK ("catalogVersion" = 1);
ALTER TABLE "User" ADD CONSTRAINT "User_positive_authorization_revision" CHECK ("authorizationRevision" >= 1);
ALTER TABLE "PermissionConversion" ADD CONSTRAINT "PermissionConversion_catalog_v1" CHECK ("catalogVersion" = 1);
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_known_source" CHECK ("source" IN ('MANUAL','LEGACY_V1'));

CREATE FUNCTION permission_user_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."authorizationRevision" < OLD."authorizationRevision" THEN RAISE EXCEPTION 'authorization revision cannot decrease'; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW."isActive" IS DISTINCT FROM OLD."isActive" THEN
    NEW."authorizationRevision" := GREATEST(NEW."authorizationRevision", OLD."authorizationRevision" + 1);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permission_user_revision_guard BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION permission_user_revision_guard();

CREATE FUNCTION permission_policy_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision < OLD.revision THEN RAISE EXCEPTION 'role policy revision cannot decrease'; END IF;
  IF NEW."catalogVersion" IS DISTINCT FROM OLD."catalogVersion" THEN NEW.revision := GREATEST(NEW.revision, OLD.revision + 1); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permission_policy_revision_guard BEFORE UPDATE ON "RolePolicy" FOR EACH ROW EXECUTE FUNCTION permission_policy_revision_guard();

-- Actual row mutations bump revisions inside the writer's transaction.
CREATE FUNCTION permission_role_row_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' THEN UPDATE "RolePolicy" SET revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE role = OLD.role; END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role) THEN UPDATE "RolePolicy" SET revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE role = NEW.role; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER permission_role_row_revision AFTER INSERT OR UPDATE OR DELETE ON "RolePermission" FOR EACH ROW EXECUTE FUNCTION permission_role_row_revision();

CREATE FUNCTION permission_account_row_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' THEN UPDATE "User" SET "authorizationRevision" = "authorizationRevision" + 1 WHERE id = OLD."userId"; END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW."userId" IS DISTINCT FROM OLD."userId") THEN UPDATE "User" SET "authorizationRevision" = "authorizationRevision" + 1 WHERE id = NEW."userId"; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER permission_override_revision AFTER INSERT OR UPDATE OR DELETE ON "UserPermissionOverride" FOR EACH ROW EXECUTE FUNCTION permission_account_row_revision();
CREATE TRIGGER permission_legacy_revision AFTER INSERT OR UPDATE OR DELETE ON "UserPermission" FOR EACH ROW EXECUTE FUNCTION permission_account_row_revision();

CREATE FUNCTION permission_driver_identity_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."userId" IS NOT DISTINCT FROM OLD."userId" AND NEW.type IS NOT DISTINCT FROM OLD.type AND NEW."isActive" IS NOT DISTINCT FROM OLD."isActive" THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' AND OLD."userId" IS NOT NULL THEN UPDATE "User" SET "authorizationRevision" = "authorizationRevision" + 1 WHERE id = OLD."userId"; END IF;
  IF TG_OP <> 'DELETE' AND NEW."userId" IS NOT NULL AND (TG_OP = 'INSERT' OR NEW."userId" IS DISTINCT FROM OLD."userId") THEN UPDATE "User" SET "authorizationRevision" = "authorizationRevision" + 1 WHERE id = NEW."userId"; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER permission_driver_identity_revision AFTER INSERT OR UPDATE OR DELETE ON "Driver" FOR EACH ROW EXECUTE FUNCTION permission_driver_identity_revision();
