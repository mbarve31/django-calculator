import json

from django.test import Client, TestCase

from calculator.services import CalculatorError, evaluate_expression


class EvaluateExpressionTests(TestCase):
    def test_basic_addition(self):
        self.assertEqual(evaluate_expression("2 + 2"), "4")

    def test_order_of_operations(self):
        self.assertEqual(evaluate_expression("2 + 3 * 4"), "14")

    def test_parentheses(self):
        self.assertEqual(evaluate_expression("(2 + 3) * 4"), "20")

    def test_modulo(self):
        self.assertEqual(evaluate_expression("10 % 3"), "1")

    def test_division_by_zero(self):
        with self.assertRaises(CalculatorError):
            evaluate_expression("5 / 0")

    def test_invalid_characters(self):
        with self.assertRaises(CalculatorError):
            evaluate_expression("__import__('os')")


class CalculateViewTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_calculate_success(self):
        response = self.client.post(
            "/api/calculate/",
            data=json.dumps({"expression": "10 / 4"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["result"], "2.5")

    def test_calculate_invalid_json(self):
        response = self.client.post(
            "/api/calculate/",
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_index_page(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Django Calculator")
