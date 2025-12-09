use serde::{Deserialize, Deserializer, Serializer};

pub mod option_string {
    use super::*;

    pub fn serialize<S>(value: &Option<String>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(s) => serializer.serialize_some(s),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let opt: Option<String> = Option::deserialize(deserializer)?;
        Ok(opt.filter(|s| !s.is_empty()))
    }
}

pub mod skip_serializing_none {
    use serde::{Serialize, Serializer};

    pub fn serialize<T, S>(value: &Option<T>, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Serialize,
        S: Serializer,
    {
        match value {
            Some(v) => serializer.serialize_some(v),
            None => serializer.serialize_none(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[test]
    fn test_option_string_serde() {
        #[derive(Serialize, Deserialize)]
        struct Test {
            #[serde(with = "option_string")]
            value: Option<String>,
        }

        let test = Test {
            value: Some("hello".to_string()),
        };
        let json = serde_json::to_string(&test).unwrap();
        assert!(json.contains("hello"));

        let test: Test = serde_json::from_str(&json).unwrap();
        assert_eq!(test.value, Some("hello".to_string()));
    }
}
