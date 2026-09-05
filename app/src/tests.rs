use crate::types::Config;
use crate::utils::{host_with_port, normalize_host};
use anyhow::anyhow;
use std::sync::LazyLock;
use url::Url;

static CONFIG: LazyLock<Config> = LazyLock::new(|| {
    Config::find("config.json", 5)
        .and_then(Config::new)
        .unwrap()
});

#[test]
fn test_url_normalization() {
    const SAMPLE: &[&str] = &[
        "https://www.abc.com",
        "https://wap.abc.com",
        "https://www.m.abc.com",
    ];

    // Url has trailing slash for some reason
    const EXPECTED: &[&str] = &["https://abc.com/", "https://abc.com/", "https://abc.com/"];

    for (i, url) in SAMPLE.iter().enumerate() {
        let mut url = Url::parse(url).unwrap();
        let host = host_with_port(&url)
            .ok_or_else(|| anyhow!("host not found"))
            .unwrap();

        let host = normalize_host(&host, &CONFIG.strippable_prefixes);
        url.set_host(Some(&host)).unwrap();

        assert_eq!(url.as_str(), EXPECTED[i]);
    }
}
