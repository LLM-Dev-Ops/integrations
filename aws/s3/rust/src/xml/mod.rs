//! XML parsing utilities for S3 responses.
//!
//! This module provides XML parsing functions for S3 API responses.

use crate::error::{ResponseError, S3Error};
use crate::types::*;
use quick_xml::events::Event;
use quick_xml::Reader;

/// Parse an S3 error response.
pub fn parse_error_response(xml: &str) -> Result<crate::error::mapping::S3ErrorResponse, S3Error> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut code = String::new();
    let mut message = String::new();
    let mut bucket = None;
    let mut key = None;
    let mut request_id = None;
    let mut host_id = None;
    let mut current_element = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                current_element = String::from_utf8_lossy(e.name().as_ref()).to_string();
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().unwrap_or_default().to_string();
                match current_element.as_str() {
                    "Code" => code = text,
                    "Message" => message = text,
                    "BucketName" | "Bucket" => bucket = Some(text),
                    "Key" => key = Some(text),
                    "RequestId" => request_id = Some(text),
                    "HostId" => host_id = Some(text),
                    _ => {}
                }
            }
            Ok(Event::End(_)) => {
                current_element.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(S3Error::Response(ResponseError::XmlParseError {
                    message: e.to_string(),
                }));
            }
            _ => {}
        }
    }

    Ok(crate::error::mapping::S3ErrorResponse {
        code,
        message,
        bucket,
        key,
        request_id,
        host_id,
    })
}

/// Parse ListObjectsV2 response.
pub fn parse_list_objects_v2(xml: &str) -> Result<ListObjectsV2Output, S3Error> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut output = ListObjectsV2Output {
        name: None,
        prefix: None,
        delimiter: None,
        max_keys: None,
        key_count: None,
        is_truncated: false,
        next_continuation_token: None,
        start_after: None,
        continuation_token: None,
        contents: Vec::new(),
        common_prefixes: Vec::new(),
        request_id: None,
    };

    let mut current_object: Option<S3Object> = None;
    let mut current_owner: Option<Owner> = None;
    let mut in_contents = false;
    let mut in_owner = false;
    let mut in_common_prefixes = false;
    let mut current_element = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                current_element = name.clone();

                match name.as_str() {
                    "Contents" => {
                        in_contents = true;
                        current_object = Some(S3Object {
                            key: String::new(),
                            last_modified: None,
                            e_tag: None,
                            size: None,
                            storage_class: None,
                            owner: None,
                        });
                    }
                    "Owner" if in_contents => {
                        in_owner = true;
                        current_owner = Some(Owner {
                            id: None,
                            display_name: None,
                        });
                    }
                    "CommonPrefixes" => {
                        in_common_prefixes = true;
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().unwrap_or_default().to_string();

                if in_contents {
                    if in_owner {
                        if let Some(owner) = current_owner.as_mut() {
                            match current_element.as_str() {
                                "ID" => owner.id = Some(text),
                                "DisplayName" => owner.display_name = Some(text),
                                _ => {}
                            }
                        }
                    } else if let Some(obj) = current_object.as_mut() {
                        match current_element.as_str() {
                            "Key" => obj.key = text,
                            "LastModified" => obj.last_modified = Some(text),
                            "ETag" => obj.e_tag = Some(text),
                            "Size" => obj.size = text.parse().ok(),
                            "StorageClass" => obj.storage_class = text.parse().ok(),
                            _ => {}
                        }
                    }
                } else if in_common_prefixes {
                    if current_element == "Prefix" {
                        output.common_prefixes.push(text);
                    }
                } else {
                    match current_element.as_str() {
                        "Name" => output.name = Some(text),
                        "Prefix" => output.prefix = Some(text),
                        "Delimiter" => output.delimiter = Some(text),
                        "MaxKeys" => output.max_keys = text.parse().ok(),
                        "KeyCount" => output.key_count = text.parse().ok(),
                        "IsTruncated" => output.is_truncated = text == "true",
                        "NextContinuationToken" => output.next_continuation_token = Some(text),
                        "StartAfter" => output.start_after = Some(text),
                        "ContinuationToken" => output.continuation_token = Some(text),
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "Contents" => {
                        if let Some(mut obj) = current_object.take() {
                            obj.owner = current_owner.take();
                            output.contents.push(obj);
                        }
                        in_contents = false;
                    }
                    "Owner" if in_contents => {
                        in_owner = false;
                    }
                    "CommonPrefixes" => {
                        in_common_prefixes = false;
                    }
                    _ => {}
                }
                current_element.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(S3Error::Response(ResponseError::XmlParseError {
                    message: e.to_string(),
                }));
            }
            _ => {}
        }
    }

    Ok(output)
}

/// Parse ListBuckets response.
pub fn parse_list_buckets(xml: &str) -> Result<ListBucketsOutput, S3Error> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut output = ListBucketsOutput {
        owner: None,
        buckets: Vec::new(),
        request_id: None,
    };

    let mut current_bucket: Option<Bucket> = None;
    let mut current_owner: Option<Owner> = None;
    let mut in_bucket = false;
    let mut in_owner = false;
    let mut current_element = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                current_element = name.clone();

                match name.as_str() {
                    "Bucket" => {
                        in_bucket = true;
                        current_bucket = Some(Bucket {
                            name: String::new(),
                            creation_date: None,
                        });
                    }
                    "Owner" => {
                        in_owner = true;
                        current_owner = Some(Owner {
                            id: None,
                            display_name: None,
                        });
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().unwrap_or_default().to_string();

                if in_bucket {
                    if let Some(bucket) = current_bucket.as_mut() {
                        match current_element.as_str() {
                            "Name" => bucket.name = text,
                            "CreationDate" => bucket.creation_date = Some(text),
                            _ => {}
                        }
                    }
                } else if in_owner {
                    if let Some(owner) = current_owner.as_mut() {
                        match current_element.as_str() {
                            "ID" => owner.id = Some(text),
                            "DisplayName" => owner.display_name = Some(text),
                            _ => {}
                        }
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "Bucket" => {
                        if let Some(bucket) = current_bucket.take() {
                            output.buckets.push(bucket);
                        }
                        in_bucket = false;
                    }
                    "Owner" => {
                        output.owner = current_owner.take();
                        in_owner = false;
                    }
                    _ => {}
                }
                current_element.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(S3Error::Response(ResponseError::XmlParseError {
                    message: e.to_string(),
                }));
            }
            _ => {}
        }
    }

    Ok(output)
}

/// Parse CreateMultipartUpload response.
pub fn parse_create_multipart_upload(xml: &str) -> Result<CreateMultipartUploadOutput, S3Error> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut bucket = String::new();
    let mut key = String::new();
    let mut upload_id = String::new();
    let mut current_element = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                current_element = String::from_utf8_lossy(e.name().as_ref()).to_string();
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().unwrap_or_default().to_string();
                match current_element.as_str() {
                    "Bucket" => bucket = text,
                    "Key" => key = text,
                    "UploadId" => upload_id = text,
                    _ => {}
                }
            }
            Ok(Event::End(_)) => {
                current_element.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(S3Error::Response(ResponseError::XmlParseError {
                    message: e.to_string(),
                }));
            }
            _ => {}
        }
    }

    Ok(CreateMultipartUploadOutput {
        bucket,
        key,
        upload_id,
        server_side_encryption: None,
        sse_kms_key_id: None,
        request_id: None,
    })
}

/// Parse CompleteMultipartUpload response.
pub fn parse_complete_multipart_upload(xml: &str) -> Result<CompleteMultipartUploadOutput, S3Error> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut output = CompleteMultipartUploadOutput {
        bucket: None,
        key: None,
        e_tag: None,
        location: None,
        version_id: None,
        server_side_encryption: None,
        sse_kms_key_id: None,
        request_id: None,
    };
    let mut current_element = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                current_element = String::from_utf8_lossy(e.name().as_ref()).to_string();
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().unwrap_or_default().to_string();
                match current_element.as_str() {
                    "Bucket" => output.bucket = Some(text),
                    "Key" => output.key = Some(text),
                    "ETag" => output.e_tag = Some(text),
                    "Location" => output.location = Some(text),
                    _ => {}
                }
            }
            Ok(Event::End(_)) => {
                current_element.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(S3Error::Response(ResponseError::XmlParseError {
                    message: e.to_string(),
                }));
            }
            _ => {}
        }
    }

    Ok(output)
}

/// Parse ListParts response.
pub fn parse_list_parts(xml: &str) -> Result<ListPartsOutput, S3Error> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut output = ListPartsOutput {
        bucket: None,
        key: None,
        upload_id: None,
        part_number_marker: None,
        next_part_number_marker: None,
        max_parts: None,
        is_truncated: false,
        parts: Vec::new(),
        initiator: None,
        owner: None,
        storage_class: None,
        request_id: None,
    };

    let mut current_part: Option<Part> = None;
    let mut in_part = false;
    let mut current_element = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                current_element = name.clone();

                if name == "Part" {
                    in_part = true;
                    current_part = Some(Part {
                        part_number: 0,
                        e_tag: String::new(),
                        size: None,
                        last_modified: None,
                    });
                }
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().unwrap_or_default().to_string();

                if in_part {
                    if let Some(part) = current_part.as_mut() {
                        match current_element.as_str() {
                            "PartNumber" => part.part_number = text.parse().unwrap_or(0),
                            "ETag" => part.e_tag = text,
                            "Size" => part.size = text.parse().ok(),
                            "LastModified" => part.last_modified = Some(text),
                            _ => {}
                        }
                    }
                } else {
                    match current_element.as_str() {
                        "Bucket" => output.bucket = Some(text),
                        "Key" => output.key = Some(text),
                        "UploadId" => output.upload_id = Some(text),
                        "PartNumberMarker" => output.part_number_marker = text.parse().ok(),
                        "NextPartNumberMarker" => output.next_part_number_marker = text.parse().ok(),
                        "MaxParts" => output.max_parts = text.parse().ok(),
                        "IsTruncated" => output.is_truncated = text == "true",
                        "StorageClass" => output.storage_class = text.parse().ok(),
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "Part" {
                    if let Some(part) = current_part.take() {
                        output.parts.push(part);
                    }
                    in_part = false;
                }
                current_element.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(S3Error::Response(ResponseError::XmlParseError {
                    message: e.to_string(),
                }));
            }
            _ => {}
        }
    }

    Ok(output)
}

/// Parse GetObjectTagging response.
pub fn parse_get_object_tagging(xml: &str) -> Result<GetObjectTaggingOutput, S3Error> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut tags = Vec::new();
    let mut current_tag: Option<(String, String)> = None;
    let mut in_tag = false;
    let mut current_element = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                current_element = name.clone();

                if name == "Tag" {
                    in_tag = true;
                    current_tag = Some((String::new(), String::new()));
                }
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().unwrap_or_default().to_string();

                if in_tag {
                    if let Some((ref mut key, ref mut value)) = current_tag {
                        match current_element.as_str() {
                            "Key" => *key = text,
                            "Value" => *value = text,
                            _ => {}
                        }
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "Tag" {
                    if let Some((key, value)) = current_tag.take() {
                        tags.push(Tag { key, value });
                    }
                    in_tag = false;
                }
                current_element.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(S3Error::Response(ResponseError::XmlParseError {
                    message: e.to_string(),
                }));
            }
            _ => {}
        }
    }

    Ok(GetObjectTaggingOutput {
        version_id: None,
        tags,
        request_id: None,
    })
}

/// Parse DeleteObjects response.
pub fn parse_delete_objects(xml: &str) -> Result<DeleteObjectsOutput, S3Error> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut output = DeleteObjectsOutput {
        deleted: Vec::new(),
        errors: Vec::new(),
        request_id: None,
    };

    let mut current_deleted: Option<DeletedObject> = None;
    let mut current_error: Option<DeleteError> = None;
    let mut in_deleted = false;
    let mut in_error = false;
    let mut current_element = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                current_element = name.clone();

                match name.as_str() {
                    "Deleted" => {
                        in_deleted = true;
                        current_deleted = Some(DeletedObject {
                            key: String::new(),
                            version_id: None,
                            delete_marker: None,
                            delete_marker_version_id: None,
                        });
                    }
                    "Error" => {
                        in_error = true;
                        current_error = Some(DeleteError {
                            key: String::new(),
                            version_id: None,
                            code: String::new(),
                            message: String::new(),
                        });
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().unwrap_or_default().to_string();

                if in_deleted {
                    if let Some(deleted) = current_deleted.as_mut() {
                        match current_element.as_str() {
                            "Key" => deleted.key = text,
                            "VersionId" => deleted.version_id = Some(text),
                            "DeleteMarker" => deleted.delete_marker = Some(text == "true"),
                            "DeleteMarkerVersionId" => deleted.delete_marker_version_id = Some(text),
                            _ => {}
                        }
                    }
                } else if in_error {
                    if let Some(error) = current_error.as_mut() {
                        match current_element.as_str() {
                            "Key" => error.key = text,
                            "VersionId" => error.version_id = Some(text),
                            "Code" => error.code = text,
                            "Message" => error.message = text,
                            _ => {}
                        }
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "Deleted" => {
                        if let Some(deleted) = current_deleted.take() {
                            output.deleted.push(deleted);
                        }
                        in_deleted = false;
                    }
                    "Error" => {
                        if let Some(error) = current_error.take() {
                            output.errors.push(error);
                        }
                        in_error = false;
                    }
                    _ => {}
                }
                current_element.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(S3Error::Response(ResponseError::XmlParseError {
                    message: e.to_string(),
                }));
            }
            _ => {}
        }
    }

    Ok(output)
}

/// Build DeleteObjects XML request body.
pub fn build_delete_objects_xml(objects: &[ObjectIdentifier], quiet: bool) -> String {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str("<Delete>");

    if quiet {
        xml.push_str("<Quiet>true</Quiet>");
    }

    for obj in objects {
        xml.push_str("<Object>");
        xml.push_str(&format!("<Key>{}</Key>", escape_xml(&obj.key)));
        if let Some(version_id) = &obj.version_id {
            xml.push_str(&format!("<VersionId>{}</VersionId>", escape_xml(version_id)));
        }
        xml.push_str("</Object>");
    }

    xml.push_str("</Delete>");
    xml
}

/// Build CompleteMultipartUpload XML request body.
pub fn build_complete_multipart_xml(parts: &[CompletedPart]) -> String {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str("<CompleteMultipartUpload>");

    for part in parts {
        xml.push_str("<Part>");
        xml.push_str(&format!("<PartNumber>{}</PartNumber>", part.part_number));
        xml.push_str(&format!("<ETag>{}</ETag>", escape_xml(&part.e_tag)));
        xml.push_str("</Part>");
    }

    xml.push_str("</CompleteMultipartUpload>");
    xml
}

/// Build PutObjectTagging XML request body.
pub fn build_put_tagging_xml(tags: &[Tag]) -> String {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str("<Tagging><TagSet>");

    for tag in tags {
        xml.push_str("<Tag>");
        xml.push_str(&format!("<Key>{}</Key>", escape_xml(&tag.key)));
        xml.push_str(&format!("<Value>{}</Value>", escape_xml(&tag.value)));
        xml.push_str("</Tag>");
    }

    xml.push_str("</TagSet></Tagging>");
    xml
}

/// Build CreateBucket XML request body (for non-us-east-1 regions).
pub fn build_create_bucket_xml(region: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <LocationConstraint>{}</LocationConstraint>
</CreateBucketConfiguration>"#,
        escape_xml(region)
    )
}

/// Parse GetBucketTagging response.
pub fn parse_get_bucket_tagging(xml: &str) -> Result<GetBucketTaggingOutput, S3Error> {
    // Bucket tagging uses the same format as object tagging
    let object_tagging = parse_get_object_tagging(xml)?;
    Ok(GetBucketTaggingOutput {
        tags: object_tagging.tags,
        request_id: object_tagging.request_id,
    })
}

/// Parse ListMultipartUploads response.
pub fn parse_list_multipart_uploads(xml: &str) -> Result<ListMultipartUploadsOutput, S3Error> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut output = ListMultipartUploadsOutput {
        bucket: None,
        prefix: None,
        delimiter: None,
        key_marker: None,
        upload_id_marker: None,
        next_key_marker: None,
        next_upload_id_marker: None,
        max_uploads: None,
        is_truncated: false,
        uploads: Vec::new(),
        common_prefixes: Vec::new(),
        request_id: None,
    };

    let mut current_upload: Option<MultipartUpload> = None;
    let mut current_owner: Option<Owner> = None;
    let mut current_initiator: Option<Owner> = None;
    let mut in_upload = false;
    let mut in_owner = false;
    let mut in_initiator = false;
    let mut in_common_prefixes = false;
    let mut current_element = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                current_element = name.clone();

                match name.as_str() {
                    "Upload" => {
                        in_upload = true;
                        current_upload = Some(MultipartUpload {
                            key: String::new(),
                            upload_id: String::new(),
                            initiator: None,
                            owner: None,
                            storage_class: None,
                            initiated: None,
                        });
                    }
                    "Owner" if in_upload => {
                        in_owner = true;
                        current_owner = Some(Owner {
                            id: None,
                            display_name: None,
                        });
                    }
                    "Initiator" if in_upload => {
                        in_initiator = true;
                        current_initiator = Some(Owner {
                            id: None,
                            display_name: None,
                        });
                    }
                    "CommonPrefixes" => {
                        in_common_prefixes = true;
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().unwrap_or_default().to_string();

                if in_upload {
                    if in_owner {
                        if let Some(owner) = current_owner.as_mut() {
                            match current_element.as_str() {
                                "ID" => owner.id = Some(text),
                                "DisplayName" => owner.display_name = Some(text),
                                _ => {}
                            }
                        }
                    } else if in_initiator {
                        if let Some(initiator) = current_initiator.as_mut() {
                            match current_element.as_str() {
                                "ID" => initiator.id = Some(text),
                                "DisplayName" => initiator.display_name = Some(text),
                                _ => {}
                            }
                        }
                    } else if let Some(upload) = current_upload.as_mut() {
                        match current_element.as_str() {
                            "Key" => upload.key = text,
                            "UploadId" => upload.upload_id = text,
                            "Initiated" => upload.initiated = Some(text),
                            "StorageClass" => upload.storage_class = text.parse().ok(),
                            _ => {}
                        }
                    }
                } else if in_common_prefixes {
                    if current_element == "Prefix" {
                        output.common_prefixes.push(text);
                    }
                } else {
                    match current_element.as_str() {
                        "Bucket" => output.bucket = Some(text),
                        "Prefix" => output.prefix = Some(text),
                        "Delimiter" => output.delimiter = Some(text),
                        "KeyMarker" => output.key_marker = Some(text),
                        "UploadIdMarker" => output.upload_id_marker = Some(text),
                        "NextKeyMarker" => output.next_key_marker = Some(text),
                        "NextUploadIdMarker" => output.next_upload_id_marker = Some(text),
                        "MaxUploads" => output.max_uploads = text.parse().ok(),
                        "IsTruncated" => output.is_truncated = text == "true",
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "Upload" => {
                        if let Some(mut upload) = current_upload.take() {
                            upload.owner = current_owner.take();
                            upload.initiator = current_initiator.take();
                            output.uploads.push(upload);
                        }
                        in_upload = false;
                    }
                    "Owner" if in_upload => {
                        in_owner = false;
                    }
                    "Initiator" if in_upload => {
                        in_initiator = false;
                    }
                    "CommonPrefixes" => {
                        in_common_prefixes = false;
                    }
                    _ => {}
                }
                current_element.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(S3Error::Response(ResponseError::XmlParseError {
                    message: e.to_string(),
                }));
            }
            _ => {}
        }
    }

    Ok(output)
}

/// Escape special characters for XML.
fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_error_response() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
        <Error>
            <Code>NoSuchKey</Code>
            <Message>The specified key does not exist.</Message>
            <Key>my-key</Key>
            <RequestId>ABC123</RequestId>
            <HostId>XYZ789</HostId>
        </Error>"#;

        let result = parse_error_response(xml).unwrap();
        assert_eq!(result.code, "NoSuchKey");
        assert_eq!(result.key, Some("my-key".to_string()));
        assert_eq!(result.request_id, Some("ABC123".to_string()));
    }

    #[test]
    fn test_parse_list_objects_v2() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
            <Name>mybucket</Name>
            <Prefix>photos/</Prefix>
            <MaxKeys>1000</MaxKeys>
            <IsTruncated>false</IsTruncated>
            <Contents>
                <Key>photos/1.jpg</Key>
                <LastModified>2023-01-01T00:00:00.000Z</LastModified>
                <ETag>"abc123"</ETag>
                <Size>1024</Size>
                <StorageClass>STANDARD</StorageClass>
            </Contents>
        </ListBucketResult>"#;

        let result = parse_list_objects_v2(xml).unwrap();
        assert_eq!(result.name, Some("mybucket".to_string()));
        assert!(!result.is_truncated);
        assert_eq!(result.contents.len(), 1);
        assert_eq!(result.contents[0].key, "photos/1.jpg");
        assert_eq!(result.contents[0].size, Some(1024));
    }

    #[test]
    fn test_parse_create_multipart_upload() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
        <InitiateMultipartUploadResult>
            <Bucket>mybucket</Bucket>
            <Key>mykey</Key>
            <UploadId>upload-123</UploadId>
        </InitiateMultipartUploadResult>"#;

        let result = parse_create_multipart_upload(xml).unwrap();
        assert_eq!(result.bucket, "mybucket");
        assert_eq!(result.key, "mykey");
        assert_eq!(result.upload_id, "upload-123");
    }

    #[test]
    fn test_build_delete_objects_xml() {
        let objects = vec![
            ObjectIdentifier::new("key1"),
            ObjectIdentifier::with_version("key2", "v1"),
        ];

        let xml = build_delete_objects_xml(&objects, true);
        assert!(xml.contains("<Quiet>true</Quiet>"));
        assert!(xml.contains("<Key>key1</Key>"));
        assert!(xml.contains("<Key>key2</Key>"));
        assert!(xml.contains("<VersionId>v1</VersionId>"));
    }

    #[test]
    fn test_build_complete_multipart_xml() {
        let parts = vec![
            CompletedPart {
                part_number: 1,
                e_tag: "\"abc\"".to_string(),
            },
            CompletedPart {
                part_number: 2,
                e_tag: "\"def\"".to_string(),
            },
        ];

        let xml = build_complete_multipart_xml(&parts);
        assert!(xml.contains("<PartNumber>1</PartNumber>"));
        assert!(xml.contains("<PartNumber>2</PartNumber>"));
    }

    #[test]
    fn test_escape_xml() {
        assert_eq!(escape_xml("a&b"), "a&amp;b");
        assert_eq!(escape_xml("a<b"), "a&lt;b");
        assert_eq!(escape_xml("a>b"), "a&gt;b");
        assert_eq!(escape_xml("a\"b"), "a&quot;b");
    }
}
