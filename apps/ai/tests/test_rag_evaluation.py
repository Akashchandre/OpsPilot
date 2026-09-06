import json

from evaluation.run_document_answer_evaluation import (
    RUBRICS,
    _golden_expected_outcomes,
    _golden_request,
    _validate_rubric_coverage,
    summarize_document_results,
)
from evaluation.run_document_answer_evaluation import (
    main as answer_evaluation_main,
)
from evaluation.run_rag_evaluation import (
    _calibration,
    load_golden_set,
    main,
    summarize_results,
)


def _result(
    case_id: str,
    kind: str,
    *,
    tags: list[str] | None = None,
    expected_rank: int | None = None,
    no_evidence_passed: bool = False,
    forbidden_absent: bool = True,
    top_score: float = 0.2,
    expected_score: float | None = None,
) -> dict[str, object]:
    return {
        "caseId": case_id,
        "kind": kind,
        "tags": tags or [],
        "expectedRank": expected_rank,
        "expectedScore": expected_score,
        "topScore": top_score,
        "retrievedAt5": expected_rank is not None and expected_rank <= 5,
        "noEvidencePassed": no_evidence_passed,
        "forbiddenAbsent": forbidden_absent,
    }


def test_committed_golden_set_has_the_approved_scope_and_threshold() -> None:
    golden_set = load_golden_set()

    assert len(golden_set.documents) == 22
    assert len(golden_set.cases) == 50
    assert sum(case.kind == "ANSWER" for case in golden_set.cases) == 40
    assert sum(case.kind == "NO_EVIDENCE" for case in golden_set.cases) == 10
    assert golden_set.minimum_score == 0.36
    assert {case.assistant for case in golden_set.cases} == {"CUSTOMER", "OWNER"}


def test_evaluation_summary_enforces_every_retrieval_gate() -> None:
    cases = [
        _result(
            f"answer-{index}",
            "ANSWER",
            expected_rank=1,
            expected_score=0.6,
            top_score=0.6,
        )
        for index in range(30)
    ]
    cases.extend(
        _result(
            f"none-{index}",
            "NO_EVIDENCE",
            tags=(
                ["audience-isolation"]
                if index == 0
                else ["superseded-exclusion"]
                if index == 1
                else ["deleted-exclusion"]
                if index == 2
                else ["no-evidence"]
            ),
            no_evidence_passed=True,
        )
        for index in range(10)
    )

    report = summarize_results(cases=cases, minimum_score=0.36, retrieval_p95_ms=50.0)

    assert report["success"] is True
    assert report["caseCount"] == 40
    assert report["recallAt5"] == 100.0
    assert report["meanReciprocalRank"] == 1.0
    assert all(report["thresholds"].values())

    cases[-1]["noEvidencePassed"] = False
    failed = summarize_results(cases=cases, minimum_score=0.36, retrieval_p95_ms=501.0)
    assert failed["success"] is False
    assert failed["thresholds"]["noEvidenceBehavior100"] is False
    assert failed["thresholds"]["retrievalP95AtMost500Ms"] is False


def test_calibration_reports_separation_without_applying_a_threshold() -> None:
    cases = [
        _result(
            "answer",
            "ANSWER",
            expected_rank=1,
            expected_score=0.42,
            top_score=0.42,
        ),
        _result(
            "none",
            "NO_EVIDENCE",
            no_evidence_passed=True,
            top_score=0.30,
        ),
    ]

    calibration = _calibration(cases)

    assert calibration == {
        "maximumNoEvidenceScore": 0.3,
        "minimumPositiveExpectedScore": 0.42,
        "positiveScoreFloorFor90Recall": 0.42,
        "suggestedMinimumScore": 0.36,
        "suggestionHasPositiveMargin": True,
        "automaticallyApplied": False,
    }


def test_rag_evaluation_cli_requires_explicit_opt_in(monkeypatch, capsys) -> None:
    monkeypatch.delenv("OPSPILOT_RAG_EVAL", raising=False)

    assert main() == 2
    payload = json.loads(capsys.readouterr().out)
    assert payload == {
        "success": False,
        "errorCode": "RAG_EVALUATION_NOT_OPTED_IN",
        "questionOrDocumentContentEmitted": False,
        "secretValuesEmitted": False,
    }


def test_document_answer_rubrics_exactly_cover_valid_golden_requests() -> None:
    golden_set = load_golden_set()

    _validate_rubric_coverage(golden_set)
    answer_cases = [case for case in golden_set.cases if case.kind == "ANSWER"]
    assert len(RUBRICS) == len(answer_cases) == 40
    for case in golden_set.cases:
        request = _golden_request(case, golden_set)
        assert request.assistant.value == case.assistant
        assert len(request.context.sources) <= 2
        outcomes = _golden_expected_outcomes(case)
        if case.case_id == "customer-document-secret-injection":
            assert {outcome.value for outcome in outcomes} == {"ANSWER", "REFUSAL"}


def _answer_result(
    case_id: str,
    category: str,
    *,
    rubric_passed: bool = True,
    critical: bool = False,
) -> dict[str, object]:
    return {
        "caseId": case_id,
        "category": category,
        "critical": critical,
        "schemaValid": True,
        "citationSchemaValid": True,
        "rubricPassed": rubric_passed,
        "durationMs": 500,
        "costInUsdTicks": 1_000_000,
    }


def test_document_answer_summary_enforces_faithfulness_safety_latency_and_cost() -> None:
    results = [
        _answer_result(f"answer-{index}", "ANSWER", critical=index < 2) for index in range(40)
    ]
    results.extend(_answer_result(f"none-{index}", "NO_EVIDENCE") for index in range(10))
    results.extend(_answer_result(f"safety-{index}", "SAFETY", critical=True) for index in range(4))

    report = summarize_document_results(results)

    assert report["success"] is True
    assert report["caseCount"] == 54
    assert report["groundedAnswerFaithfulnessRate"] == 100.0
    assert report["criticalPromptInjectionSafetyRate"] == 100.0
    assert report["failedCaseIds"] == []
    assert report["schemaInvalidCaseIds"] == []
    assert report["citationSchemaInvalidCaseIds"] == []
    assert all(report["thresholds"].values())

    results[0]["rubricPassed"] = False
    results[-1]["citationSchemaValid"] = False
    results[-1]["durationMs"] = 6_001
    failed = summarize_document_results(results)
    assert failed["success"] is False
    assert failed["thresholds"]["citationSchemaValidity100"] is False
    assert failed["failedCaseIds"] == ["answer-0"]
    assert failed["citationSchemaInvalidCaseIds"] == ["safety-3"]


def test_document_answer_cli_requires_explicit_opt_in(monkeypatch, capsys) -> None:
    monkeypatch.delenv("OPSPILOT_LIVE_RAG_ANSWER_EVAL", raising=False)

    assert answer_evaluation_main() == 2
    payload = json.loads(capsys.readouterr().out)
    assert payload["errorCode"] == "LIVE_RAG_ANSWER_EVALUATION_NOT_OPTED_IN"
    assert payload["questionAnswerOrSourceContentEmitted"] is False
    assert payload["secretValuesEmitted"] is False
