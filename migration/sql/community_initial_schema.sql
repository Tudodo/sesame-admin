CREATE TABLE public.departments (
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    name character varying NOT NULL,
    description character varying,
    parent_id integer,
    sort_order integer DEFAULT 0 NOT NULL,
    tenant_id character varying(64) DEFAULT 'default'::character varying,
    code character varying(64)
);
CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;
CREATE TABLE public.dictionaries (
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    name character varying NOT NULL,
    code character varying NOT NULL,
    description character varying,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.dictionaries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.dictionaries_id_seq OWNED BY public.dictionaries.id;
CREATE TABLE public.dictionary_entries (
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    label character varying NOT NULL,
    value character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    dictionary_id integer NOT NULL,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.dictionary_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.dictionary_entries_id_seq OWNED BY public.dictionary_entries.id;
CREATE TABLE public.login_log (
    id bigint NOT NULL,
    user_name character varying DEFAULT ''::character varying NOT NULL,
    login_ip character varying DEFAULT ''::character varying NOT NULL,
    login_location character varying,
    browser character varying,
    os character varying,
    status integer DEFAULT 0 NOT NULL,
    msg character varying,
    login_time timestamp with time zone,
    user_id character varying,
    tenant_id character varying
);
CREATE SEQUENCE public.login_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.login_log_id_seq OWNED BY public.login_log.id;
CREATE TABLE public.menus (
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    name character varying NOT NULL,
    path character varying,
    icon character varying,
    parent_id integer,
    sort_order integer DEFAULT 0 NOT NULL,
    permission character varying,
    visible boolean DEFAULT true NOT NULL,
    menu_type character varying(1) NOT NULL,
    actions jsonb DEFAULT '["create", "read", "update", "delete"]'::jsonb,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.menus_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.menus_id_seq OWNED BY public.menus.id;
CREATE TABLE public.notif (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    title character varying NOT NULL,
    content text NOT NULL,
    notification_type character varying DEFAULT 'info'::character varying NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    link character varying,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.notif_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.notif_id_seq OWNED BY public.notif.id;
CREATE TABLE public.oper_log (
    id bigint NOT NULL,
    title character varying DEFAULT ''::character varying NOT NULL,
    business_type integer DEFAULT 0 NOT NULL,
    method character varying DEFAULT ''::character varying NOT NULL,
    request_method character varying DEFAULT 'GET'::character varying NOT NULL,
    oper_url character varying DEFAULT ''::character varying NOT NULL,
    oper_ip character varying DEFAULT ''::character varying NOT NULL,
    oper_param text,
    json_result text,
    status integer DEFAULT 0 NOT NULL,
    error_msg text,
    oper_time timestamp with time zone,
    cost_time bigint DEFAULT 0 NOT NULL,
    oper_name character varying DEFAULT ''::character varying NOT NULL,
    dept_name character varying,
    tenant_id character varying,
    user_id character varying
);
CREATE SEQUENCE public.oper_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.oper_log_id_seq OWNED BY public.oper_log.id;
CREATE TABLE public.page_config (
    id integer NOT NULL,
    name character varying NOT NULL,
    code character varying NOT NULL,
    page_type character varying DEFAULT 'table'::character varying NOT NULL,
    config jsonb NOT NULL,
    status character varying DEFAULT 'enabled'::character varying NOT NULL,
    description character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.page_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.page_config_id_seq OWNED BY public.page_config.id;
CREATE TABLE public.positions (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(500),
    dept_id integer,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.positions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.positions_id_seq OWNED BY public.positions.id;
CREATE TABLE public.roles (
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    name character varying NOT NULL,
    description character varying,
    role_key character varying(64) NOT NULL,
    role_sort integer DEFAULT 0 NOT NULL,
    status smallint DEFAULT 1 NOT NULL,
    data_scope smallint DEFAULT 1 NOT NULL,
    dept_ids jsonb,
    tenant_id character varying(64) DEFAULT 'default'::character varying,
    is_system boolean DEFAULT false NOT NULL
);
CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;
CREATE TABLE public.roles_menus (
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    role_id integer NOT NULL,
    menu_id integer NOT NULL,
    permissions jsonb,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.roles_menus_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.roles_menus_id_seq OWNED BY public.roles_menus.id;
CREATE TABLE public.scheduled_task (
    id integer NOT NULL,
    name character varying NOT NULL,
    cron_expr character varying NOT NULL,
    handler character varying NOT NULL,
    params jsonb,
    status character varying DEFAULT 'enabled'::character varying NOT NULL,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    description character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.scheduled_task_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.scheduled_task_id_seq OWNED BY public.scheduled_task.id;
CREATE TABLE public.scheduled_task_log (
    id integer NOT NULL,
    task_id integer NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    status character varying NOT NULL,
    output text,
    error_message text,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.scheduled_task_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.scheduled_task_log_id_seq OWNED BY public.scheduled_task_log.id;
CREATE TABLE public.storage_config (
    id bigint NOT NULL,
    provider character varying DEFAULT 'local'::character varying NOT NULL,
    local_path character varying DEFAULT 'uploads'::character varying NOT NULL,
    s3_bucket character varying,
    s3_region character varying,
    s3_endpoint character varying,
    s3_access_key character varying,
    s3_secret_key character varying,
    s3_enabled boolean DEFAULT false NOT NULL,
    tenant_id character varying,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE public.storage_config_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.storage_config_id_seq OWNED BY public.storage_config.id;
CREATE TABLE public.sync_source (
    id integer NOT NULL,
    name character varying NOT NULL,
    source_type character varying DEFAULT 'database'::character varying NOT NULL,
    connection_config jsonb NOT NULL,
    target_table character varying NOT NULL,
    field_mapping jsonb,
    sync_mode character varying DEFAULT 'full'::character varying NOT NULL,
    status character varying DEFAULT 'enabled'::character varying NOT NULL,
    last_sync_at timestamp with time zone,
    tenant_id character varying,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);
CREATE SEQUENCE public.sync_source_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.sync_source_id_seq OWNED BY public.sync_source.id;
CREATE TABLE public.sync_source_table (
    id integer NOT NULL,
    source_id integer NOT NULL,
    source_table character varying NOT NULL,
    target_table character varying NOT NULL,
    target_connection_url character varying,
    field_mapping jsonb,
    sync_mode character varying DEFAULT 'full'::character varying NOT NULL,
    status character varying DEFAULT 'enabled'::character varying NOT NULL,
    last_sync_at timestamp with time zone,
    last_row_count integer,
    tenant_id character varying,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);
CREATE SEQUENCE public.sync_source_table_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.sync_source_table_id_seq OWNED BY public.sync_source_table.id;
CREATE TABLE public.sys_config (
    id bigint NOT NULL,
    config_name character varying DEFAULT ''::character varying NOT NULL,
    config_key character varying DEFAULT ''::character varying NOT NULL,
    config_value character varying DEFAULT ''::character varying NOT NULL,
    config_type character varying DEFAULT 'Y'::character varying NOT NULL,
    remark character varying,
    tenant_id character varying
);
CREATE SEQUENCE public.sys_config_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.sys_config_id_seq OWNED BY public.sys_config.id;
CREATE TABLE public.tenant (
    id integer NOT NULL,
    name character varying NOT NULL,
    code character varying NOT NULL,
    domain character varying,
    status character varying DEFAULT 'enabled'::character varying NOT NULL,
    contact_name character varying,
    contact_email character varying,
    description character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE public.tenant_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.tenant_id_seq OWNED BY public.tenant.id;
CREATE TABLE public.user_sessions (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    user_name character varying DEFAULT ''::character varying NOT NULL,
    login_ip character varying DEFAULT ''::character varying NOT NULL,
    login_location character varying,
    browser character varying,
    os character varying,
    token character varying NOT NULL,
    login_time timestamp with time zone,
    expires_at timestamp with time zone,
    tenant_id character varying
);
CREATE TABLE public.users (
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    pid uuid NOT NULL,
    email character varying NOT NULL,
    password character varying NOT NULL,
    api_key character varying NOT NULL,
    name character varying NOT NULL,
    reset_token character varying,
    reset_sent_at timestamp with time zone,
    email_verification_token character varying,
    email_verification_sent_at timestamp with time zone,
    email_verified_at timestamp with time zone,
    magic_link_token character varying,
    magic_link_expiration timestamp with time zone,
    department_id integer,
    tenant_id character varying(64) DEFAULT 'default'::character varying,
    manager_pid uuid
);
CREATE TABLE public.users_departments (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id integer NOT NULL,
    department_id integer NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.users_departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.users_departments_id_seq OWNED BY public.users_departments.id;
CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;
CREATE TABLE public.users_positions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    position_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.users_positions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.users_positions_id_seq OWNED BY public.users_positions.id;
CREATE TABLE public.users_roles (
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    user_id integer NOT NULL,
    role_id integer NOT NULL,
    tenant_id character varying(64) DEFAULT 'default'::character varying
);
CREATE SEQUENCE public.users_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.users_roles_id_seq OWNED BY public.users_roles.id;
ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);
ALTER TABLE ONLY public.dictionaries ALTER COLUMN id SET DEFAULT nextval('public.dictionaries_id_seq'::regclass);
ALTER TABLE ONLY public.dictionary_entries ALTER COLUMN id SET DEFAULT nextval('public.dictionary_entries_id_seq'::regclass);
ALTER TABLE ONLY public.login_log ALTER COLUMN id SET DEFAULT nextval('public.login_log_id_seq'::regclass);
ALTER TABLE ONLY public.menus ALTER COLUMN id SET DEFAULT nextval('public.menus_id_seq'::regclass);
ALTER TABLE ONLY public.notif ALTER COLUMN id SET DEFAULT nextval('public.notif_id_seq'::regclass);
ALTER TABLE ONLY public.oper_log ALTER COLUMN id SET DEFAULT nextval('public.oper_log_id_seq'::regclass);
ALTER TABLE ONLY public.page_config ALTER COLUMN id SET DEFAULT nextval('public.page_config_id_seq'::regclass);
ALTER TABLE ONLY public.positions ALTER COLUMN id SET DEFAULT nextval('public.positions_id_seq'::regclass);
ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);
ALTER TABLE ONLY public.roles_menus ALTER COLUMN id SET DEFAULT nextval('public.roles_menus_id_seq'::regclass);
ALTER TABLE ONLY public.scheduled_task ALTER COLUMN id SET DEFAULT nextval('public.scheduled_task_id_seq'::regclass);
ALTER TABLE ONLY public.scheduled_task_log ALTER COLUMN id SET DEFAULT nextval('public.scheduled_task_log_id_seq'::regclass);
ALTER TABLE ONLY public.storage_config ALTER COLUMN id SET DEFAULT nextval('public.storage_config_id_seq'::regclass);
ALTER TABLE ONLY public.sync_source ALTER COLUMN id SET DEFAULT nextval('public.sync_source_id_seq'::regclass);
ALTER TABLE ONLY public.sync_source_table ALTER COLUMN id SET DEFAULT nextval('public.sync_source_table_id_seq'::regclass);
ALTER TABLE ONLY public.sys_config ALTER COLUMN id SET DEFAULT nextval('public.sys_config_id_seq'::regclass);
ALTER TABLE ONLY public.tenant ALTER COLUMN id SET DEFAULT nextval('public.tenant_id_seq'::regclass);
ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);
ALTER TABLE ONLY public.users_departments ALTER COLUMN id SET DEFAULT nextval('public.users_departments_id_seq'::regclass);
ALTER TABLE ONLY public.users_positions ALTER COLUMN id SET DEFAULT nextval('public.users_positions_id_seq'::regclass);
ALTER TABLE ONLY public.users_roles ALTER COLUMN id SET DEFAULT nextval('public.users_roles_id_seq'::regclass);
ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.dictionaries
    ADD CONSTRAINT dictionaries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.dictionary_entries
    ADD CONSTRAINT dictionary_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.login_log
    ADD CONSTRAINT login_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.menus
    ADD CONSTRAINT menus_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notif
    ADD CONSTRAINT notif_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.oper_log
    ADD CONSTRAINT oper_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.page_config
    ADD CONSTRAINT page_config_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.roles_menus
    ADD CONSTRAINT roles_menus_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.scheduled_task_log
    ADD CONSTRAINT scheduled_task_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.scheduled_task
    ADD CONSTRAINT scheduled_task_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.storage_config
    ADD CONSTRAINT storage_config_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sync_source
    ADD CONSTRAINT sync_source_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sync_source_table
    ADD CONSTRAINT sync_source_table_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sys_config
    ADD CONSTRAINT sys_config_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenant
    ADD CONSTRAINT tenant_code_key UNIQUE (code);
ALTER TABLE ONLY public.tenant
    ADD CONSTRAINT tenant_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_api_key_key UNIQUE (api_key);
ALTER TABLE ONLY public.users_departments
    ADD CONSTRAINT users_departments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users_departments
    ADD CONSTRAINT users_departments_user_id_department_id_key UNIQUE (user_id, department_id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users_positions
    ADD CONSTRAINT users_positions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users_positions
    ADD CONSTRAINT users_positions_user_id_position_id_key UNIQUE (user_id, position_id);
ALTER TABLE ONLY public.users_roles
    ADD CONSTRAINT users_roles_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX idx_departments_code_tenant ON public.departments USING btree (tenant_id, code) WHERE (code IS NOT NULL);
CREATE INDEX idx_departments_tenant_id ON public.departments USING btree (tenant_id);
CREATE UNIQUE INDEX idx_dictionaries_code_tenant ON public.dictionaries USING btree (code, tenant_id);
CREATE INDEX idx_dictionary_entries_dict_tenant ON public.dictionary_entries USING btree (dictionary_id, tenant_id);
CREATE INDEX idx_login_log_tenant_time ON public.login_log USING btree (tenant_id, login_time DESC);
CREATE INDEX idx_login_log_time ON public.login_log USING btree (login_time);
CREATE INDEX idx_menus_tenant_id ON public.menus USING btree (tenant_id);
CREATE INDEX idx_notif_user_read ON public.notif USING btree (user_id, is_read);
CREATE INDEX idx_notif_user_tenant_created ON public.notif USING btree (user_id, tenant_id, created_at DESC);
CREATE INDEX idx_notif_user_tenant_unread ON public.notif USING btree (user_id, tenant_id, is_read) WHERE (is_read = false);
CREATE INDEX idx_oper_log_tenant_time ON public.oper_log USING btree (tenant_id, oper_time DESC);
CREATE INDEX idx_oper_log_time ON public.oper_log USING btree (oper_time);
CREATE INDEX idx_oper_log_user_tenant ON public.oper_log USING btree (user_id, tenant_id);
CREATE UNIQUE INDEX idx_page_config_code_tenant ON public.page_config USING btree (code, tenant_id);
CREATE INDEX idx_positions_dept ON public.positions USING btree (dept_id);
CREATE INDEX idx_positions_tenant_dept ON public.positions USING btree (tenant_id, dept_id);
CREATE INDEX idx_roles_menus_menu ON public.roles_menus USING btree (menu_id);
CREATE INDEX idx_roles_menus_role ON public.roles_menus USING btree (role_id);
CREATE INDEX idx_roles_menus_tenant ON public.roles_menus USING btree (tenant_id);
CREATE UNIQUE INDEX idx_roles_name_tenant ON public.roles USING btree (name, tenant_id);
CREATE INDEX idx_roles_tenant_id ON public.roles USING btree (tenant_id);
CREATE INDEX idx_scheduled_task_log_tenant_id ON public.scheduled_task_log USING btree (tenant_id, id DESC);
CREATE INDEX idx_scheduled_tasks_status ON public.scheduled_task USING btree (status);
CREATE INDEX idx_scheduled_tasks_tenant_status ON public.scheduled_task USING btree (tenant_id, status);
CREATE INDEX idx_storage_config_tenant ON public.storage_config USING btree (tenant_id);
CREATE UNIQUE INDEX idx_sync_source_table_src_tbl_tenant ON public.sync_source_table USING btree (source_id, source_table, tenant_id);
CREATE INDEX idx_sync_source_table_tenant_source ON public.sync_source_table USING btree (tenant_id, source_id);
CREATE INDEX idx_sync_source_tenant ON public.sync_source USING btree (tenant_id);
CREATE INDEX idx_sys_config_key ON public.sys_config USING btree (config_key);
CREATE INDEX idx_user_sessions_expires ON public.user_sessions USING btree (expires_at);
CREATE INDEX idx_user_sessions_tenant ON public.user_sessions USING btree (tenant_id);
CREATE INDEX idx_user_sessions_tenant_login_time ON public.user_sessions USING btree (tenant_id, login_time DESC);
CREATE INDEX idx_user_sessions_tenant_user ON public.user_sessions USING btree (tenant_id, user_id);
CREATE INDEX idx_users_departments_dept ON public.users_departments USING btree (department_id);
CREATE INDEX idx_users_departments_tenant ON public.users_departments USING btree (tenant_id);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE UNIQUE INDEX idx_users_email_tenant ON public.users USING btree (email, tenant_id);
CREATE INDEX idx_users_magic_link_token ON public.users USING btree (magic_link_token);
CREATE INDEX idx_users_manager_pid ON public.users USING btree (manager_pid);
CREATE UNIQUE INDEX idx_users_pid ON public.users USING btree (pid);
CREATE INDEX idx_users_positions_position ON public.users_positions USING btree (position_id);
CREATE INDEX idx_users_positions_tenant ON public.users_positions USING btree (tenant_id);
CREATE INDEX idx_users_positions_user ON public.users_positions USING btree (user_id);
CREATE INDEX idx_users_reset_token ON public.users USING btree (reset_token);
CREATE INDEX idx_users_roles_role ON public.users_roles USING btree (role_id);
CREATE INDEX idx_users_roles_tenant ON public.users_roles USING btree (tenant_id);
CREATE INDEX idx_users_roles_user ON public.users_roles USING btree (user_id);
CREATE INDEX idx_users_tenant_id ON public.users USING btree (tenant_id);
CREATE INDEX idx_users_verification_token ON public.users USING btree (email_verification_token);
CREATE UNIQUE INDEX uk_sys_config_key_tenant ON public.sys_config USING btree (config_key, tenant_id);
ALTER TABLE ONLY public.departments
    ADD CONSTRAINT "fk-departments-parent_id-to-departments" FOREIGN KEY (parent_id) REFERENCES public.departments(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.dictionary_entries
    ADD CONSTRAINT "fk-dictionaries-dictionary_id-to-dictionary_entries" FOREIGN KEY (dictionary_id) REFERENCES public.dictionaries(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.roles_menus
    ADD CONSTRAINT "fk-menus-menu_id-to-roles_menus" FOREIGN KEY (menu_id) REFERENCES public.menus(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.menus
    ADD CONSTRAINT "fk-menus-parent_id-to-menus" FOREIGN KEY (parent_id) REFERENCES public.menus(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.roles_menus
    ADD CONSTRAINT "fk-roles-role_id-to-roles_menus" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.users_roles
    ADD CONSTRAINT "fk-roles-role_id-to-users_roles" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.users
    ADD CONSTRAINT "fk-users-department_id-to-departments" FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.users_roles
    ADD CONSTRAINT "fk-users-user_id-to-users_roles" FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.sync_source_table
    ADD CONSTRAINT fk_sync_source_table_source FOREIGN KEY (source_id) REFERENCES public.sync_source(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.scheduled_task_log
    ADD CONSTRAINT fk_task_log_task_id FOREIGN KEY (task_id) REFERENCES public.scheduled_task(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.departments(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.users_departments
    ADD CONSTRAINT users_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.users_departments
    ADD CONSTRAINT users_departments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.users_positions
    ADD CONSTRAINT users_positions_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.users_positions
    ADD CONSTRAINT users_positions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
