# Running the Tests

## Run All Security Tests

```bash
# From the project root
uv run pytest src/tests/security/ -v

# Run with coverage
uv run pytest src/tests/security/ --cov=src.security --cov-report=html
```

## Run Specific Test Files

```bash
# Run only core security tests
uv run pytest src/tests/security/test_security.py -v

# Run only authentication tests
uv run pytest src/tests/security/test_auth.py -v

# Run only RBAC v2 tests
uv run pytest src/tests/services/test_rbac_v2.py -v

# Run only feature usage tests
uv run pytest src/tests/security/test_features_utils.py -v
```

## Run Comprehensive Tests

```bash
# Run the comprehensive test suite
uv run pytest src/tests/security/test_security_all.py -v
```
