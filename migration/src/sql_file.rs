use sea_orm_migration::prelude::*;

pub async fn execute_sql_file(m: &SchemaManager<'_>, sql: &str) -> Result<(), DbErr> {
    for statement in split_sql_statements(sql) {
        let statement = statement.trim();
        if statement.is_empty() {
            continue;
        }
        m.get_connection().execute_unprepared(statement).await?;
    }
    Ok(())
}

fn split_sql_statements(sql: &str) -> Vec<&str> {
    let bytes = sql.as_bytes();
    let mut statements = Vec::new();
    let mut start = 0;
    let mut index = 0;
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut dollar_tag: Option<&str> = None;

    while index < bytes.len() {
        if in_line_comment {
            if bytes[index] == b'\n' {
                in_line_comment = false;
            }
            index += 1;
            continue;
        }

        if in_block_comment {
            if bytes[index..].starts_with(b"*/") {
                in_block_comment = false;
                index += 2;
            } else {
                index += 1;
            }
            continue;
        }

        if let Some(tag) = dollar_tag {
            if bytes[index..].starts_with(tag.as_bytes()) {
                dollar_tag = None;
                index += tag.len();
            } else {
                index += 1;
            }
            continue;
        }

        if bytes[index..].starts_with(b"--") {
            in_line_comment = true;
            index += 2;
            continue;
        }

        if bytes[index..].starts_with(b"/*") {
            in_block_comment = true;
            index += 2;
            continue;
        }

        match bytes[index] {
            b'\'' if in_single_quote && index + 1 < bytes.len() && bytes[index + 1] == b'\'' => {
                index += 2;
            }
            b'\'' => {
                in_single_quote = !in_single_quote;
                index += 1;
            }
            b'"' if in_double_quote && index + 1 < bytes.len() && bytes[index + 1] == b'"' => {
                index += 2;
            }
            b'"' => {
                in_double_quote = !in_double_quote;
                index += 1;
            }
            b'$' if !in_single_quote && !in_double_quote => {
                if let Some((tag, next)) = dollar_quote_tag(sql, index) {
                    dollar_tag = Some(tag);
                    index = next;
                } else {
                    index += 1;
                }
            }
            b';' if !in_single_quote && !in_double_quote => {
                statements.push(&sql[start..index]);
                start = index + 1;
                index += 1;
            }
            _ => index += 1,
        }
    }

    statements.push(&sql[start..]);
    statements
}

fn dollar_quote_tag(sql: &str, start: usize) -> Option<(&str, usize)> {
    let bytes = sql.as_bytes();
    let mut index = start + 1;
    while index < bytes.len() && (bytes[index].is_ascii_alphanumeric() || bytes[index] == b'_') {
        index += 1;
    }
    if index >= bytes.len() || bytes[index] != b'$' {
        return None;
    }
    Some((&sql[start..=index], index + 1))
}
