# DEPRECATED
> **WARNING:** This document is outdated. Please refer to `server/NEOLIT.md` and `server/DATA_MODEL.md` for the current (v24 Absolute Final) architecture.

# Migration guide
This document outlines the major changes and migration steps required for transitioning from the previous version of the project to the latest version. Please follow the instructions carefully to ensure a smooth upgrade process.
Explore NEOLIT files in project first.
You should not break existing functionality or significantly change things that are not related to the new features.
All changes should follow best practices and coding standards established in the project, and awesome architecture principles where need new concepts.

# New User System
Few user types need to be added. User creation needs to be implemented. Users can be organizations or individuals. Organizations can have multiple individual users associated with them, with different roles with customizable permissions (what they can view and do). Need robust authentication and authorization system, and user data structure in system.

## Global user types: 
- Super Admin: Full access to all system features and settings (service provider role).
- Manufacturer Admin: Manage manufacturer-specific settings, products, and users. Manages requisitions and orders for their organization, can create catalogs, have warehouses. Can create and manage individual users within their organization. Their account usage is managed by outside service provider (Super Admin) and some features may be restricted manually by them. (in case of contract limits reached or other things not tracked in app).
- Contractor Admin: Manage contractor-specific settings, projects, and users. Manages requisitions and orders for their organization, can create projects. Utilizes core app features: projects, nesting and cutting layouts. Have warehouse to use material across projects. Can create and manage individual users within their organization. Contractor can define their top-level cutting and/or installing capabilities that define what they can do across all projects (can be only cutting only or only installing existing panels). This user should have billing and subscription management capabilities (that exist now).
- Customer Admin: Manage customer-specific settings, projects, and users. Manages requisitions and orders for their organization, can create projects. Can create and manage individual users within their organization.
- Individual User: Assigned specific roles and permissions within their organization (e.g., Manufacturer User, Contractor User, Customer User). Their access is limited based on the permissions set by their organization's admin.

## Users Interactions:
- User Registration: Implement a registration process for new users, allowing them to sign up as individuals or as part of an organization. Remove google and github sign in options.
- User Login: Implement a secure login system with password hashing and session management.
- Role Assignment: Allow organization admins to assign roles and permissions to individual users within their organization.
- User Management: Provide interfaces for admins to manage users, including adding, removing, and updating user information and roles.
- Profile Management: Allow users to view and update their profile information, including changing passwords and managing personal settings.
- Access Control: Implement access control mechanisms to restrict or allow access to features based on user roles and permissions.
- Users can have assotiations with each other. For example, user A from organization X can be linked to user B from organization Y as a project collaborator. This association allows them to work together on shared projects, with permissions defined by their respective roles within their organizations. Contractor user sees all catalogs from manufacturer users for composing requisitions. 

# Data Model Development Specification

## Notes: 
- Entity that is called "Batch" in current implementation (part of project with nestings) now called "Queue", and "Batch" term is used for incoming material batches from manufacturers. 

## 1. Objective
Develop a data model for a materials accounting system for a milling company's operations—from sheet batch receipt to cutting, cassette formation, and inventory accounting. The model should provide end-to-end analytics and integration with accounting systems (e.g., 1C).

## 2. Key Entities and Their Attributes

### Warehouse
Warehouse entity represents virtual storage locations for sheets, cassettes, and remnants. Different users have different warehouses (manufacturer has warehouse that represent physically storing piles, contractor has warehouse for storing sheets received from manufacturer and remnants from cutting).
- **Warehouse ID**;
- **Organization Information** (link to organization entity);
- **Location Details** (address, contact person);
- **Inventory Summary** (overview of current stock levels for batches/piles, sheets, cassettes, remnants).

### Catalog
Catalogs are created by manufacturer users to define available sheet types for contractors to order. They can include various materials, colors, thicknesses, and prices.
- **Catalog ID**;
- **Manufacturer Information** (organization and contact person, link to organization entity);
- **Sheet Types** (lists of available sheets characteristics: material, color, thickness, foil thickness for composite, size options, price per sq.m; all these should have types and IDs for composing exact product and linking to requisition orders);
- **Metadata** (creation date, last updated date, version).

### Requisition Order
Order created by contractor user to request sheets from manufacturer. Can be created from nesting panel when sheets are missing in stock for cutting, or manually by contractor user. Once created, it is sent to manufacturer user who can approve and fulfill it by sending batches of sheets.
- **Requisition Order ID**;
- **Contractor Information** (organization and contact person, link to organization entity);
- **Manufacturer Information** (organization and contact person, link to organization entity);
- **Order Composition** (list of requested sheets with characteristics: material, color, thickness, foil thickness for composite, size, quantity, price per sq.m, total price);
- **Status** (e.g., "draft," "sent," "approved," "fulfilled," "canceled"); status changes have timestamps and responsible persons recorded;
- **Linked Batches** (list of batches sent to fulfill the order, references to "Batch" entities).

### Batch
Basically a delivery of sheets from manufacturer to warehouse. Piles are batch sheets grouped by manufacturer party ID (usually for different colors). When used in nesting, sheets are taken from batches and corresponding batch pile count is decreased. Can be created by contractor user and be part of a requisition order to manufacturer. Manufacturer user can update batch status when sending sheets to contractor.
- **Batch ID** (unique number);
- **Receipt ID**;
- **Batch Composition** (can be few piles in one batch, for each: manufacturer, number of sheets, material ( color, thickness, foil thickness for composite ), sheet size, manufacturer party ID, price per sq.m, total price);
- **Status** (e.g.,  "requested," "assembled," "sent," "arrived," "in stock," "partially used", "used up"); status changes have timestamps and responsible persons recorded, additional metadata as needed like transport info, delivery dates, etc.;
- **Supplier Information** (can be supplier organization, manufacturer directly, contact person);
- **Beneficiary Information** (warehouse or organization receiving the batch, link to organization entity);
Probably pile structure can be implemented as separate entity "Batch Pile" linked to "Batch" entity, if needed.

### Cassette Template
Use existing cassette-schema structure.
- **JSON definition** (from current cassette standard);

### Cassette Design
Currently cassettes are baked only for nesting, but they need to be separate entities stored in accounting system for tracking their life cycle.
- **Cassette ID**;
- **Sheet Membership** (reference to the "Sheet" entity);
- **Template Reference** (link to "Cassette Template" entity if applicable, and exact values for named dimensions);
- **Geometry** (dxf file) (if applicable);

### Cassette Instance
Exact cassette cut from sheet for project. When developing this entity, consider that it should be possible to integrate them into BIM workflows as facade panels in the future.
- **Cassette Instance ID**;
- **Cassette Template Reference** (link to "Cassette Template" entity);
- **Cassette Design Reference** (link to "Cassette Design" entity);
- **Sheet Membership** (reference to the "Sheet" entity);
- **Project Membership** (reference to the "Project" entity);
- **Geometry** (dxf file) (if applicable);
- **Status** (e.g., "nested", "manufactured," "on-site," "installed"), with timestamps and responsible persons recorded;

### Sheet Design
In nesting, there can be sheet layouts that assume being cut multiple times into cassettes. This is needed for optimizing sheet usage.
- **Sheet Design ID**;
- **Geometry** (dxf file);
- **References to derived entities** (cassette designs, queue and project references);

### Sheet
Exact sheets are created when batch is touched (queue using it is marked as cut, so sheets are taken from batch piles).
- **Sheet ID**;
- **Batch Membership** (reference to the "Batch" and pile);
- **Status** (e.g.: "in stock", "in cutting", "milled",);
- **Characteristics** (size, color, material), received from pile info;
- **Movement and Operation History** (who worked with the sheet and when: milling machine operator, storekeeper);
- **References to derived entities** (cassettes, remnants).

### Remnant
Remnants are fragments left after cutting sheets into cassettes. They should be tracked for potential reuse in future orders.
- **Remnant ID**;
- **Sheet Assignment** (reference to the "Sheet" entity);
- **Geometry**;
- **QR Code**;
- **Status** (e.g., "in stock," "used");
- **Reusability** (flag).

### Project
Extend current project entity to include material accounting aspects.
- **Project ID**;
- **Project Name**;
- **Customer** (link to user or string);
- **Contractor** (owner user, idk how it is implemented now);
- **Queues** (batches in current naming);
- **Metadata** (deadlines, responsible persons, address).

## 3. Relationships between Entities
**IMPORTANT:** For many of them, maybe need to rethink structure and relationships.
For example, probably, can optimize things like linking cassettes to projects, templates and sheets, consider link drilling or one field with references, find best approach.
Following list outlines few essential relationships and is not exhaustive:
- **Batch ↔ Sheet**: one-to-many (one batch contains multiple sheets).
- **Sheet Design ↔ Cassette Design**: one-to-many (several cassette designs can be created from one sheet design).
- **Sheet ↔ Cassette instance**: one-to-many (several cassettes can be made from one sheet).
- **Sheet ↔ Remnant**: one-to-many (several fragments may remain after cutting the sheet).
- **User ↔ Project**: many-to-many (a user can participate in multiple projects; a single project can involve multiple users, but usually one contractor user is owner) 
- **Project ↔ Sheet/Cassette**: many to many (the project uses different sheets and cassettes).

## 4. Accounting and Data Flow Principles

- **Batch Receipt**: When a batch is received, its details are recorded, and sheets are created based on the batch composition.
- **Sheet Cutting**: When sheets are cut into cassettes, the status of the sheets is updated, and cassette instances are created.
- **Remnant Tracking**: After cutting, remnants are recorded and tracked for potential reuse.
- **Inventory Updates**: The warehouse inventory is updated in real-time as batches are received, sheets are cut, and remnants are utilized.
- **Status Changes**: All status changes for batches, sheets, cassettes, and remnants are logged with timestamps and responsible persons, and with links to related documents (requests, invoices, drawings).
- **Integration with Accounting Systems**: Data should be structured to facilitate integration with external accounting systems (e.g., 1C) for financial tracking and reporting.    

